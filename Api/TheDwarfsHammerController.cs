using System;
using System.Linq;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TheDwarfsHammer.Api
{
    /// <summary>
    /// The Dwarf's Hammer API controller.
    /// Provides secure access to plugin configuration and TMDB proxy requests.
    /// </summary>
    [ApiController]
    [Route("Plugins/TheDwarfsHammer")]
    [Authorize] // Jellyfin handles authentication via X-Emby-Token
    public class TheDwarfsHammerController : ControllerBase
    {
        private readonly ILogger<TheDwarfsHammerController> _logger;
        private readonly IHttpClientFactory _httpClientFactory;

        /// <summary>
        /// Initializes a new instance of the <see cref="TheDwarfsHammerController"/> class.
        /// </summary>
        public TheDwarfsHammerController(
            ILogger<TheDwarfsHammerController> logger,
            IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>
        /// Get plugin configuration (filtered based on user role).
        /// Admins get full config, regular users get safe subset.
        /// </summary>
        [HttpGet("Configuration")]
        public ActionResult<object> GetConfiguration()
        {
            try
            {
                _logger.LogInformation("GetConfiguration called. User authenticated: {Auth}", User.Identity?.IsAuthenticated);

                var config = Plugin.Instance?.Configuration;

                if (config == null)
                {
                    _logger.LogError("Plugin configuration not found");
                    return NotFound("Plugin configuration not found");
                }

                // Check if user is admin via role claim
                var roleClaim = User.Claims.FirstOrDefault(c =>
                    c.Type == "http://schemas.microsoft.com/ws/2008/06/identity/claims/role")?.Value;

                bool isAdmin = roleClaim == "Administrator";

                _logger.LogInformation("User role: {Role}. Admin: {IsAdmin}", roleClaim, isAdmin);

                if (isAdmin)
                {
                    return Ok(config); // full configuration for admins
                }

                // Safe subset for regular users
                return Ok(new
                {
                    EnableUpcomingMovies = config.EnableUpcomingMovies,
                    EnableUpcomingSeries = config.EnableUpcomingSeries,
                    EnableNoCollectionFilter = config.EnableNoCollectionFilter,
                    EnableSeriesCollectionsTab = config.EnableSeriesCollectionsTab,
                    UpcomingMoviesCacheDuration = config.UpcomingMoviesCacheDuration,
                    UpcomingSeriesCacheDuration = config.UpcomingSeriesCacheDuration,
                    CollectionsCacheDuration = config.CollectionsCacheDuration,
                    AutoTagInterval = config.AutoTagInterval 
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting plugin configuration");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        /// <summary>
        /// Check if TMDB API key is configured (without exposing the actual key)
        /// </summary>
        [HttpGet("Configuration/HasTMDB")]
        public ActionResult<bool> HasTMDBKey()
        {
            try
            {
                var config = Plugin.Instance?.Configuration;
                var hasKey = !string.IsNullOrEmpty(config?.TmdbApiKey);

                _logger.LogInformation("TMDB API key configured: {HasKey}", hasKey);

                return Ok(hasKey);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking TMDB configuration");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        /// <summary>
        /// Proxy TMDB API requests securely.
        /// API key is added server-side and never exposed to client.
        /// </summary>
        [HttpGet("TMDB/{**path}")]
        public async Task<ActionResult> ProxyTMDB(string path)
        {
            try
            {
                var config = Plugin.Instance?.Configuration;

                if (string.IsNullOrEmpty(config?.TmdbApiKey))
                {
                    _logger.LogWarning("TMDB API request attempted but API key not configured");
                    return BadRequest(new { error = "TMDB API key not configured", message = "Please configure it in plugin settings." });
                }

                var queryString = HttpContext.Request.QueryString.ToString();
                var tmdbUrl = $"https://api.themoviedb.org/3/{path}{queryString}";
                var separator = queryString.Length > 0 ? "&" : "?";
                tmdbUrl += $"{separator}api_key={config.TmdbApiKey}";

                _logger.LogInformation("Proxying TMDB request: {Url}", tmdbUrl);

                using var httpClient = _httpClientFactory.CreateClient();
                httpClient.Timeout = TimeSpan.FromSeconds(30);

                var response = await httpClient.GetAsync(tmdbUrl).ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    _logger.LogWarning("TMDB API request failed with status {StatusCode}: {Error}", response.StatusCode, errorContent);
                    return StatusCode((int)response.StatusCode, new { error = "TMDB API error", content = errorContent });
                }

                var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                return Content(content, "application/json");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error while proxying TMDB request");
                return StatusCode(503, new { error = "Error connecting to TMDB API", message = ex.Message });
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "TMDB request timeout");
                return StatusCode(504, new { error = "TMDB request timeout", message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error proxying TMDB request");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }
    }
}
