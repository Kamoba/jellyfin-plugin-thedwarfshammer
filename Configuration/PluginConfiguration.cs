using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.TheDwarfsHammer.Configuration
{
    /// <summary>
    /// Plugin configuration for The Dwarf's Hammer.
    /// </summary>
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>
        /// Initializes a new instance of the <see cref="PluginConfiguration"/> class.
        /// </summary>
        public PluginConfiguration()
        {
            // Set default values
            TmdbApiKey = string.Empty;
            EnableUpcomingMovies = true;
            EnableUpcomingSeries = true;
            EnableRealtimeTagging = false;
            EnableNoCollectionFilter = true;
            EnableSeriesCollectionsTab = true;
            UpcomingMoviesCacheDuration = 3600000; // 1 hour
            UpcomingSeriesCacheDuration = 3600000; // 1 hour
            CollectionsCacheDuration = 300000; // 5 minutes
            AutoTagInterval = 300000; // 5 minutes
        }

        /// <summary>
        /// Gets or sets the TMDB API Key.
        /// This is stored securely server-side and never exposed to clients.
        /// </summary>
        public string TmdbApiKey { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether the Upcoming Movies feature is enabled.
        /// </summary>
        public bool EnableUpcomingMovies { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether the Upcoming Series feature is enabled.
        /// </summary>
        public bool EnableUpcomingSeries { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether real-time auto-tagging is enabled (admin only).
        /// </summary>
        public bool EnableRealtimeTagging { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether the "No Collection" filter feature is enabled.
        /// </summary>
        public bool EnableNoCollectionFilter { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether the Series Collections tab is enabled.
        /// </summary>
        public bool EnableSeriesCollectionsTab { get; set; }

        /// <summary>
        /// Gets or sets the cache duration for upcoming movies in milliseconds.
        /// Default: 3600000 (1 hour).
        /// </summary>
        public int UpcomingMoviesCacheDuration { get; set; }

        /// <summary>
        /// Gets or sets the cache duration for upcoming series in milliseconds.
        /// Default: 3600000 (1 hour).
        /// </summary>
        public int UpcomingSeriesCacheDuration { get; set; }

        /// <summary>
        /// Gets or sets the cache duration for collections in milliseconds.
        /// Default: 300000 (5 minutes).
        /// </summary>
        public int CollectionsCacheDuration { get; set; }

        /// <summary>
        /// Gets or sets the interval for auto-tagging in milliseconds.
        /// Default: 300000 (5 minutes).
        /// </summary>
        public int AutoTagInterval { get; set; }
    }
}
