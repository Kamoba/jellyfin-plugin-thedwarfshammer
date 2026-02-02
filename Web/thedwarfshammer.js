// ========================================
// THE DWARF'S HAMMER - CLIENT SCRIPT
// Enhanced Jellyfin collection and content management
// ========================================
// This script works with The Dwarf's Hammer Jellyfin plugin
// for secure TMDB API integration
// ========================================

(function () {
  "use strict";

  // Check if user is admin
  let IS_ADMIN = false;
  let devMode = false; // for logs
  let hasTMDB = false;

  const CONFIG = {
    autoTagInterval: 5 * 60 * 1000,
    tagName: "NotInCollection",
    realtimeTagging: "jellyfin_tdh_realtimeTagging",
    storageKey: "jellyfin_tdh_hideCollectionMovies",
    upcomingMoviesCacheDuration: 1 * 60 * 60 * 1000,
    upcomingMoviesCache: "jellyfin_tdh_upcomingMoviesCache",
    upcomingMoviesGenreFilter: "jellyfin_tdh_upcoming_movies_genreFilter",
    showsCollectionsCacheDuration: 5 * 60 * 1000,
    upcomingGenreFilter: 'jellyfin_tdh_upcoming_genreFilter',
    upcomingSeriesCacheDuration: 1 * 60 * 60 * 1000,
    upcomingSeriesGenreFilter: "jellyfin_tdh_upcoming_series_genreFilter",
    missingSeriesCache: "jellyfin_tdh_missingseries_cache",
    missingSeriesCacheTTL: 24 * 60 * 60 * 1000,
    collectionsCache: "jellyfin_tdh_collectionsCache",
    seriesCollectionsCache: "jellyfin_tdh_seriesCollectionsCache",
    moviesCollectionsCache: "jellyfin_tdh_moviesCollectionsCache",
    upcomingSeriesCache: "jellyfin_tdh_upcomingSeriesCache",
    defaultHidden: true,
  };
  // ========================================
  // CLIENT-SIDE USER CONFIGURATION
  // ========================================
  const USER_CONFIG = {
    features: {
      noCollectionFilter: true,
      collectionsButton: true,
      actorSearchMenu: true,
      copyTitleMenu: true,
      missingEpisodes: true,
      missingSeasons: true,
      upcomingMovies: true,
      upcomingSeries: true,
      seriesCollectionsTab: true,
      realtimeTagging: false,
    },
    ui: {
      defaultHideCollections: true,
      showFilterIndicator: true,
    },
    data: {
      comingSoonLimit: 100,
      topRatedLimit: 200,
      trendingLimit: 100,
    }
  };

  // ========================================
  // PLUGIN CONFIGURATION (Server-side)
  // ========================================
  let PLUGIN_CONFIG = null;
  let PLUGIN_CONFIG_TIMESTAMP = 0;
  const PLUGIN_CONFIG_CACHE_DURATION = 5 * 60 * 1000;

  /**
   * Fetch plugin configuration from server
   */
  async function getPluginConfig(forceRefresh = false) {
    if (!forceRefresh && PLUGIN_CONFIG && 
        (Date.now() - PLUGIN_CONFIG_TIMESTAMP) < PLUGIN_CONFIG_CACHE_DURATION) {
      return PLUGIN_CONFIG;
    }
    
    const { accessToken } = getCredentials();
    
    try {
      const response = await fetch(
        `/Plugins/TheDwarfsHammer/Configuration`,
        { headers: { 'X-Emby-Token': accessToken } }
      );
      
      if (response.ok) {
        PLUGIN_CONFIG = await response.json();
        PLUGIN_CONFIG_TIMESTAMP = Date.now();
        consoleLog("✓ Plugin configuration loaded", PLUGIN_CONFIG);
        return PLUGIN_CONFIG;
      } else {
        console.warn("⚠️ Failed to fetch plugin config, using defaults");
        return null;
      }
    } catch (error) {
      console.error('Failed to fetch plugin config:', error);
      return null;
    }
  }

  /**
   * Check if TMDB API is configured
   */
  async function hasTMDBConfigured() {
    try {
      const { accessToken } = getCredentials();
      const response = await fetch(
        `/Plugins/TheDwarfsHammer/Configuration/HasTMDB`,
        { headers: { 'X-Emby-Token': accessToken } }
      );
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error checking TMDB status:', error);
    }
    return false;
  }

  /**
   * Secure TMDB API request through server proxy
   * API key never exposed to client
   */
  async function secureTMDBFetch(path, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/Plugins/TheDwarfsHammer/TMDB/${path}${queryString ? '?' + queryString : ''}`;
    
    const { accessToken } = getCredentials();
    const response = await fetch(url, {
      headers: { 'X-Emby-Token': accessToken }
    });
    
    if (!response.ok) {
      throw new Error(`TMDB request failed: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Check if a feature is enabled globally
   */
  async function isFeatureEnabled(featureName) {
    const config = await getPluginConfig();
    
    if (config) {
      const featureMap = {
        'upcomingMovies': config.EnableUpcomingMovies,
        'upcomingSeries': config.EnableUpcomingSeries,
        'realtimeTagging': config.EnableRealtimeTagging,
        'noCollectionFilter': config.EnableNoCollectionFilter,
        'seriesCollectionsTab': config.EnableSeriesCollectionsTab,
      };
      
      if (featureMap.hasOwnProperty(featureName)) {
        return featureMap[featureName] ?? USER_CONFIG.features[featureName];
      }
    }
    
    return USER_CONFIG.features[featureName] ?? false;
  }

  // ========================================
  // LOAD/SAVE USER CONFIG
  // ========================================
  
  function loadUserConfig() {
    try {
      const stored = localStorage.getItem('jellyfin_tdh_user_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.keys(USER_CONFIG).forEach(section => {
          if (parsed[section]) {
            USER_CONFIG[section] = { ...USER_CONFIG[section], ...parsed[section] };
          }
        });
        consoleLog("✓ User config loaded");
      }
    } catch (e) {
      console.warn('Failed to load user config:', e);
    }
  }

  function saveUserConfig() {
    try {
      localStorage.setItem('jellyfin_tdh_user_config', JSON.stringify(USER_CONFIG));
      consoleLog("✓ User config saved");
    } catch (e) {
      console.error('Failed to save user config:', e);
    }
  }

  // ========================================
  // INITIALIZE CONFIGURATION
  // ========================================
  
  async function initializeConfig() {
    loadUserConfig();
    
    const pluginConfig = await getPluginConfig();
    
    // Merge plugin settings into USER_CONFIG (plugin wins)
    if (pluginConfig) {
      USER_CONFIG.features.upcomingMovies = pluginConfig.EnableUpcomingMovies;
      USER_CONFIG.features.upcomingSeries = pluginConfig.EnableUpcomingSeries;
      USER_CONFIG.features.noCollectionFilter = pluginConfig.EnableNoCollectionFilter;
      USER_CONFIG.features.seriesCollectionsTab = pluginConfig.EnableSeriesCollectionsTab;
      USER_CONFIG.features.realtimeTagging = pluginConfig.EnableRealtimeTagging;
      
      consoleLog("✅ Plugin config merged:", USER_CONFIG.features);
    }
    if (pluginConfig?.AutoTagInterval) {
      CONFIG.autoTagInterval = pluginConfig.AutoTagInterval;
    }
    hasTMDB = await hasTMDBConfigured();
    if (!hasTMDB) {
      console.warn("⚠️ TMDB API not configured. Upcoming features will be disabled.");
      console.warn("Please configure TMDB API key in plugin settings (admin only).");
    }
    
    consoleLog("✓ Configuration initialized");
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  function showApiKeyWarning(container, type = 'movies') { 
  
    if (!container) return;
    const message = type === 'movies' 
      ? 'Upcoming Movies feature requires TMDB API configuration.'
      : 'Upcoming Series feature requires TMDB API configuration.';
      
    container.innerHTML = `
      <div style="
        padding: 3em 2em;
        text-align: center;
        max-width: 600px;
        margin: 0 auto;
      ">
        <span class="material-icons" style="
          font-size: 4em;
          color: #ffc107;
          opacity: 0.8;
        ">warning</span>
        
        <h2 style="margin: 1em 0 0.5em 0; color: #fff;">TMDB API Key Required</h2>
        
        <p style="color: #aaa; line-height: 1.6; margin-bottom: 2em;">
          ${message}<br>
          Please ask your administrator to configure the TMDB API key in the plugin settings.
        </p>
        
        ${IS_ADMIN ? `
          <a href="/web/#!/configurationpage?name=The%20Dwarf%27s%20Hammer" 
            class="emby-button raised button-submit">
            <span>Configure API Key</span>
          </a>
        ` : ''}
      </div>
    `;
  }

  function getCredentials() {
    const creds = JSON.parse(
      localStorage.getItem("jellyfin_credentials") || "{}"
    );
    return {
      userId: creds.Servers?.[0]?.UserId,
      accessToken: creds.Servers?.[0]?.AccessToken,
      serverId: creds.Servers?.[0]?.Id,
    };
  }


  // ========================================
  // ORIGINAL SCRIPT
  // ========================================


        // -------------------------------
        // INTERCEPT Navigation page
        // -------------------------------
        (function hookHistory() {
          const push = history.pushState;
          const replace = history.replaceState;

          history.pushState = function () {
            push.apply(this, arguments);
            window.dispatchEvent(new Event("jellyfin:navigation"));
          };

          history.replaceState = function () {
            replace.apply(this, arguments);
            window.dispatchEvent(new Event("jellyfin:navigation"));
          };

          window.addEventListener("popstate", () => {
            window.dispatchEvent(new Event("jellyfin:navigation"));
          });
        })();

        // -------------------------------
        // INTERCEPT /Items API
        // -------------------------------
        (function interceptItems() {
          if (window.__JF_ITEMS_INTERCEPTED__) return;
          window.__JF_ITEMS_INTERCEPTED__ = true;

          const origFetch = window.fetch;

          window.fetch = async function (...args) {
            const res = await origFetch.apply(this, args);

            try {
              const url = args[0]?.toString?.() || "";

              if (url.includes("/Items") && url.includes("Tags=NotInCollection")) {

                const clone = res.clone();
                const data = await clone.json();

                // Only remove cards if we're on movies/tv page AND NotInCollection filter is active
                const isMoviePage = location.hash.startsWith("#/movies?"); consoleLog("interceptItems");
                
                const isTvPage = location.hash.startsWith("#/tv?");

                // fix for filter indicator overlap
                if (isMoviePage || isTvPage) {
                  setTimeout(() => {                  
                    const indicatorContainer = document.querySelector('.page .flex .btnFilter-wrapper .filterIndicator');
                    if (indicatorContainer) {                  
                      indicatorContainer.style.pointerEvents = "none";
                    }
                  }, 1000);
                }

                const filterActive =
                  localStorage.getItem(
                    `${getCredentials().userId}-*-filter`
                  )?.includes("NotInCollection");

                if ((isMoviePage || isTvPage) && filterActive &&
                    window.jellyfinTheDwarfsHammer?.removedIds?.size) {
                  data.Items = data.Items.filter(
                    m => !window.jellyfinTheDwarfsHammer.removedIds.has(m.Id)
                  );
                  data.TotalRecordCount = data.Items.length;
                }

                return new Response(JSON.stringify(data), {
                  status: res.status,
                  statusText: res.statusText,
                  headers: res.headers
                });
              }
            } catch (e) {
              console.warn("Items intercept failed", e);
            }

            return res;
          };

          consoleLog("🧬 Jellyfin Items pipeline intercepted");
        })();


        // ========================================
        // UTILITY FUNCTIONS
        // ========================================

        function getCredentials() {
          const creds = JSON.parse(
            localStorage.getItem("jellyfin_credentials") || "{}"
          );
          return {
            userId: creds.Servers?.[0]?.UserId,
            accessToken: creds.Servers?.[0]?.AccessToken,
            serverId: creds.Servers?.[0]?.Id,
          };
        }

        async function isUserAdmin() {
          const { userId, accessToken } = getCredentials();
          if (!userId || !accessToken) return false;

          try {
            const response = await fetch(`/Users/${userId}`, {
              headers: { "X-Emby-Token": accessToken },
            });

            if (response.ok) {
              const user = await response.json();
              return user.Policy?.IsAdministrator === true;
            }
          } catch (error) {
            console.error("Error checking admin status:", error);
          }

          return false;
        }

        function apiRequest(endpoint, options = {}) {
          const { accessToken } = getCredentials();
          return fetch(endpoint, {
            ...options,
            headers: {
              "X-Emby-Token": accessToken,
              ...options.headers,
            },
          }).then((r) => r.json());
        }



        // function removeMovieCardFromUI(movieId) {
        //   if (!movieId || !isOnNotInCollectionView()) return;

        //     const selectors = [
        //       `[data-id="${movieId}"]`,
        //       `[data-itemid="${movieId}"]`,
        //       `.card[data-id="${movieId}"]`
        //     ];
  
        //     let removed = false;
  
        //     selectors.forEach(sel => {
        //       document.querySelectorAll(sel).forEach(el => {
        //         el.remove();
        //         removed = true;
        //       });
        //     });
  
        //     if (removed) {
        //       consoleLog("🎬 Removed movie from current view:", movieId);
        //     }
        // }

        // ========================================
// AUTO-APPLY "No Collection" FILTER ON FIRST RUN
// ========================================

let defaultApplied = false;

function applyDefaultFilterIfNeeded() {
  if (!USER_CONFIG.features.noCollectionFilter) return;
  if (!USER_CONFIG.ui.defaultHideCollections) return;

  if (defaultApplied) return;

  const stored = localStorage.getItem(CONFIG.storageKey); 
  const defaultHiddenBool = CONFIG.defaultHidden === true || CONFIG.defaultHidden === "true"; 

  // Only apply if user has never changed preference and defaultHidden is true
  if (stored === null && defaultHiddenBool) {
    defaultApplied = true;
    consoleLog("🆕 First run → enabling No Collection filter");

    // Set localStorage so future runs know user preference
    localStorage.setItem(CONFIG.storageKey, "true");

    // Trigger the filter via Jellyfin UI safely
    autoApplyNotInCollection(true);
  }
}

let noScript = false;
function openFilterDialog() {
  const btn =
    document.querySelector('[data-action="filter"]') ||
    document.querySelector('.btnFilter') ||
    document.querySelector('button[title*="Filter"]');

  if (!btn) {
    console.warn("❌ Filter button not found");
    return false;
  }
  noScript = true;
  console.warn("!!! Filter button found!!!!");
  btn.click();
  return true;
}

function toggleJellyfinFilter(enable = true, filterName) {
  const cb = document.querySelector(filterName || '.filterDialogContent .checkboxList .emby-checkbox');
  if (!cb) return false;  

  if (filterName == undefined) {
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    consoleLog('✓ Soft Refresh triggered');
  }
  else{
    if (cb.checked !== enable) {
      cb.checked = enable;
      // Dispatch event to let Jellyfin UI update
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      consoleLog(`✓ Filter checkbox set to ${enable}`);
    }
  }

  return true;
}

function toggleJellyfinNotInCollection(enable = true) {
  toggleJellyfinFilter(enable = true, '[data-filter="NotInCollection"]')
}

function closeFilterDialog() {
  // Try standard close buttons first
  const closeBtn =
    document.querySelector('.filterDialogContent .button-cancel') ||
    document.querySelector('.filterDialogContent button[type="submit"]') ||
    document.querySelector('.filterDialogContent .button-close');

  if (closeBtn) {
    closeBtn.click();
    return;
  }

  // Fallback: simulate click outside on the dialog container
  const dialogContainer = document.querySelector('.dialogContainer');
  if (dialogContainer) {
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      dialogContainer.dispatchEvent(event);
    });
  }
}


function autoApplyNotInCollection(enable = true) {
  if (!isOnVideoLibraryPage()) return false;

  hideFilterDialog();
   
  if (!openFilterDialog()) {
    console.warn("❌ Cannot open filter dialog, will retry in 100ms");
    setTimeout(() => autoApplyNotInCollection(enable), 100);
    return;
  }

  const interval = setInterval(() => {
    const ok = toggleJellyfinNotInCollection(enable);
    if (!ok) {
      return;
    } // checkbox not yet ready, retry

    clearInterval(interval);

    // Close dialog and soft refresh
    setTimeout(() => {
      closeFilterDialog();
      setTimeout(() => {        
        hideFilterDialog(false);
      }, 100);
      // setTimeout(() => {
      //   if (typeof window.jellyfinTheDwarfsHammer?.softRefreshMoviesList === "function") {
      //     window.jellyfinTheDwarfsHammer.softRefreshMoviesList();
      //   } else {
      //     consoleLog("⚠ softRefreshMoviesList() not available yet");
      //   }
      // }, 120);
    }, 80);
  }, 50);
}

function isOnVideoLibraryPage() {
  return location.hash.startsWith("#/movies") || location.hash.startsWith("#/tv");
}

function softRefreshMoviesList(){
  if (!isOnVideoLibraryPage()) {
    consoleLog("⏭️ Soft refresh skipped (not on movies/tv page)");
    return;
  }
  hideFilterDialog();
   
  if (!openFilterDialog()) {
    console.warn("❌ Cannot open filter dialog, will retry in 100ms");
    setTimeout(() => softRefreshMoviesList(), 100);
    return;
  }

    const interval = setInterval(() => {
    const ok = toggleJellyfinFilter();
    if (!ok) {
      return;
    } // checkbox not yet ready, retry

    clearInterval(interval);

    // Close dialog and soft refresh
    setTimeout(() => {
      closeFilterDialog();
      consoleLog("✓ Soft refresh triggered");
      setTimeout(() => {        
        hideFilterDialog(false);
      }, 100);
    }, 80);
  }, 50);

}

function hideFilterDialog(hide = true) {
  const styleId = "jellyfin-hide-filter-dialog-style";
  let style = document.getElementById(styleId);

  if (hide) {
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .dialogBackdrop,
        .dialogContainer,
        .filterDialog {
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
      consoleLog("👻 Filter dialog hidden via CSS");
    }
  } else {
    if (style) {
      style.remove();
      noScript = false;
      consoleLog("✨ Filter dialog visibility restored");
    }
  }
}


// ========================================
// CALL THIS AFTER SCRIPT INJECTION
// ========================================
applyDefaultFilterIfNeeded();


        // ========================================
        // CLEAR ALL FILTERS
        // ========================================

        function clearAllFilters() {
          consoleLog("Clearing all filters...");

          const filterDialog = document.querySelector(".filterDialogContent");
          if (!filterDialog) {
            console.warn("Filter dialog not found");
            return;
          }

          const checkboxes = filterDialog.querySelectorAll(
            "input.emby-checkbox:checked"
          );

          let cleared = 0;
          checkboxes.forEach((checkbox) => {
            if (checkbox.dataset.genre === 'all') return;
            checkbox.click();
            cleared++;
          });

          consoleLog(`✓ Cleared ${cleared} filters`);

          localStorage.setItem(CONFIG.storageKey, "false");
        }

        // ========================================
        // COLLECTION & TAG MANAGEMENT
        // ========================================

        async function getAllCollections(noCache = false) {
          if (!noCache) {
            const cached = localStorage.getItem(CONFIG.collectionsCache);
            if (cached) {
              const { collections, timestamp } = JSON.parse(cached);
              if (Date.now() - timestamp < 3600000) {
                return collections;
              }
            }
          }

          const data = await apiRequest(
            "/Items?IncludeItemTypes=BoxSet&Recursive=true"
          );

          localStorage.setItem(CONFIG.collectionsCache, JSON.stringify({
            collections: data.Items,
            timestamp: Date.now()
          }));

          return data.Items;
        }


        async function getMoviesInCollection(collectionId) {
          const data = await apiRequest(
            `/Items?ParentId=${collectionId}&IncludeItemTypes=Movie`
          );
          return data.Items;
        }

        async function getAllMovies() {
          const { userId } = getCredentials();
          const data = await apiRequest(
            `/Users/${userId}/Items?IncludeItemTypes=Movie&Recursive=true&Fields=Tags`
          );
          return data.Items;
        }

        async function addTagToMovie(movieId, tag) {

          const { userId, accessToken } = getCredentials();

          try {
            const response1 = await fetch(
              `/Users/${userId}/Items?Ids=${movieId}&Fields=Path,ProviderIds,People,Studios,Genres,Tags,Overview`,
              {
                headers: { "X-Emby-Token": accessToken },
              }
            );

            if (!response1.ok) {
              console.error(
                `Can't fetch movie ${movieId}: ${response1.status}`
              );
              return false;
            }

            const data = await response1.json();

            if (!data.Items || data.Items.length === 0) {
              console.error(`Movie ${movieId} not found`);
              return false;
            }

            const movie = data.Items[0];
            const tags = movie.Tags || [];

            if (tags.includes(tag)) {
              return true;
            }

            tags.push(tag);

            const updatePayload = {
              Id: movie.Id,
              Name: movie.Name,
              OriginalTitle: movie.OriginalTitle || "",
              ForcedSortName: movie.ForcedSortName || "",
              CommunityRating: movie.CommunityRating,
              CriticRating: movie.CriticRating,
              IndexNumber: movie.IndexNumber,
              AirsBeforeSeasonNumber: movie.AirsBeforeSeasonNumber || "",
              AirsAfterSeasonNumber: movie.AirsAfterSeasonNumber || "",
              AirsBeforeEpisodeNumber: movie.AirsBeforeEpisodeNumber || "",
              ParentIndexNumber: movie.ParentIndexNumber,
              DisplayOrder: movie.DisplayOrder || "",
              Album: movie.Album || "",
              AlbumArtists: movie.AlbumArtists || [],
              ArtistItems: movie.ArtistItems || [],
              Overview: movie.Overview || "",
              Status: movie.Status || "",
              AirDays: movie.AirDays || [],
              AirTime: movie.AirTime || "",
              Genres: movie.Genres || [],
              Tags: tags,
              Studios: movie.Studios || [],
              PremiereDate: movie.PremiereDate,
              DateCreated: movie.DateCreated,
              EndDate: movie.EndDate,
              ProductionYear: movie.ProductionYear,
              Height: movie.Height,
              AspectRatio: movie.AspectRatio || "",
              Video3DFormat: movie.Video3DFormat || "",
              OfficialRating: movie.OfficialRating || "",
              CustomRating: movie.CustomRating || "",
              People: movie.People || [],
              LockData: movie.LockData || false,
              LockedFields: movie.LockedFields || [],
              ProviderIds: movie.ProviderIds || {},
              PreferredMetadataLanguage: movie.PreferredMetadataLanguage || "",
              PreferredMetadataCountryCode:
                movie.PreferredMetadataCountryCode || "",
              Taglines: movie.Taglines || [],
            };

            const response2 = await fetch(`/Items/${movieId}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Emby-Token": accessToken,
              },
              body: JSON.stringify(updatePayload),
            });

            return response2.status === 204 || response2.ok;
          } catch (error) {
            console.error(`Error tagging movie ${movieId}:`, error);
            return false;
          }
        }

        async function removeTagFromMovie(movieId, tag) {
          const { userId, accessToken } = getCredentials();

          try {
            const response1 = await fetch(
              `/Users/${userId}/Items?Ids=${movieId}&Fields=Path,ProviderIds,People,Studios,Genres,Tags,Overview`,
              {
                headers: { "X-Emby-Token": accessToken },
              }
            );

            if (!response1.ok) return false;

            const data = await response1.json();
            if (!data.Items || data.Items.length === 0) return false;

            const movie = data.Items[0];
            const tags = movie.Tags || [];
            const filteredTags = tags.filter((t) => t !== tag);

            if (filteredTags.length === tags.length) {
              return true;
            }

            const updatePayload = {
              Id: movie.Id,
              Name: movie.Name,
              OriginalTitle: movie.OriginalTitle || "",
              ForcedSortName: movie.ForcedSortName || "",
              CommunityRating: movie.CommunityRating,
              CriticRating: movie.CriticRating,
              IndexNumber: movie.IndexNumber,
              AirsBeforeSeasonNumber: movie.AirsBeforeSeasonNumber || "",
              AirsAfterSeasonNumber: movie.AirsAfterSeasonNumber || "",
              AirsBeforeEpisodeNumber: movie.AirsBeforeEpisodeNumber || "",
              ParentIndexNumber: movie.ParentIndexNumber,
              DisplayOrder: movie.DisplayOrder || "",
              Album: movie.Album || "",
              AlbumArtists: movie.AlbumArtists || [],
              ArtistItems: movie.ArtistItems || [],
              Overview: movie.Overview || "",
              Status: movie.Status || "",
              AirDays: movie.AirDays || [],
              AirTime: movie.AirTime || "",
              Genres: movie.Genres || [],
              Tags: filteredTags,
              Studios: movie.Studios || [],
              PremiereDate: movie.PremiereDate,
              DateCreated: movie.DateCreated,
              EndDate: movie.EndDate,
              ProductionYear: movie.ProductionYear,
              Height: movie.Height,
              AspectRatio: movie.AspectRatio || "",
              Video3DFormat: movie.Video3DFormat || "",
              OfficialRating: movie.OfficialRating || "",
              CustomRating: movie.CustomRating || "",
              People: movie.People || [],
              LockData: movie.LockData || false,
              LockedFields: movie.LockedFields || [],
              ProviderIds: movie.ProviderIds || {},
              PreferredMetadataLanguage: movie.PreferredMetadataLanguage || "",
              PreferredMetadataCountryCode:
                movie.PreferredMetadataCountryCode || "",
              Taglines: movie.Taglines || [],
            };

            const response2 = await fetch(`/Items/${movieId}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Emby-Token": accessToken,
              },
              body: JSON.stringify(updatePayload),
            });

            return response2.status === 204 || response2.ok;
          } catch (error) {
            console.error(`Error removing tag:`, error);
            return false;
          }
        }

        async function tagAllNonCollectionMovies() {
          if (!IS_ADMIN) return;

          consoleLog("Starting to tag non-collection movies...");

          const { accessToken, userId } = getCredentials();
          if (!accessToken || !userId) {
            console.error("❌ No authentication credentials found.");
            return 0;
          }

          try {
            const collections = await getAllCollections();
            consoleLog(`Found ${collections.length} collections`);

            const moviesInCollections = new Set();

            for (const collection of collections) {
              const movies = await getMoviesInCollection(collection.Id);
              movies.forEach((movie) => moviesInCollections.add(movie.Id));
            }

            consoleLog(
              `Found ${moviesInCollections.size} movies in collections`
            );

            const allMovies = await getAllMovies();
            consoleLog(`Total movies in library: ${allMovies.length}`);

            let totalTagged = 0;
            let totalFailed = 0;
            let alreadyTagged = 0;

            for (const movie of allMovies) {
              if (!moviesInCollections.has(movie.Id)) {
                const currentTags = movie.Tags || [];

                if (currentTags.includes(CONFIG.tagName)) {
                  alreadyTagged++;
                  continue;
                }

                const success = await addTagToMovie(movie.Id, CONFIG.tagName);
                if (success) {
                  totalTagged++;
                  consoleLog(`✓ Tagged: ${movie.Name}`);
                } else {
                  totalFailed++;
                }

                await new Promise((resolve) => setTimeout(resolve, 50));
              }
            }

            consoleLog(`\n=== Tagging Complete ===`);
            consoleLog(`✓ Successfully tagged: ${totalTagged} movies`);
            consoleLog(`- Already tagged: ${alreadyTagged} movies`);
            consoleLog(
              `- In collections (skipped): ${moviesInCollections.size} movies`
            );
            if (totalFailed > 0) {
              consoleLog(`✗ Failed: ${totalFailed} movies`);
            }
            consoleLog(`========================\n`);

            return totalTagged;
          } catch (error) {
            console.error("❌ Error during tagging:", error);
            return 0;
          }
        }

        async function syncCollectionTags() {

          if (!IS_ADMIN) return;

          consoleLog("Syncing collection tags...");

          try {
            showSpinner();
            const collections = await getAllCollections();
            const moviesInCollections = new Set();

            for (const collection of collections) {
              const movies = await getMoviesInCollection(collection.Id);
              movies.forEach((movie) => moviesInCollections.add(movie.Id));
            }

            consoleLog(
              `Found ${moviesInCollections.size} movies in collections`
            );

            const { userId } = getCredentials();
            const taggedMovies = await apiRequest(
              `/Users/${userId}/Items?IncludeItemTypes=Movie&Recursive=true&Tags=${CONFIG.tagName}&Fields=Tags`
            );

            consoleLog(
              `Found ${taggedMovies.TotalRecordCount} movies with "${CONFIG.tagName}" tag`
            );

            let removed = 0;
            let added = 0;

            for (const movie of taggedMovies.Items) {
              if (moviesInCollections.has(movie.Id)) {
                const success = await removeTagFromMovie(
                  movie.Id,
                  CONFIG.tagName
                );
                if (success) {
                  removed++;
                  consoleLog(
                    `✓ Removed tag from: ${movie.Name} (now in collection)`
                  );
                  // 👇 instantly remove from current Movies view if visible
                 //removeMovieCardFromUI(movie.Id);
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
            }

            const allMovies = await getAllMovies();
            for (const movie of allMovies) {
              if (!moviesInCollections.has(movie.Id)) {
                const currentTags = movie.Tags || [];
                if (!currentTags.includes(CONFIG.tagName)) {
                  const success = await addTagToMovie(movie.Id, CONFIG.tagName);
                  if (success) {
                    added++;
                    consoleLog(`✓ Added tag to: ${movie.Name}`);
                  }
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
              }
            }

            consoleLog(`\n=== Sync Complete ===`);
            consoleLog(`✓ Tags removed: ${removed}`);
            consoleLog(`✓ Tags added: ${added}`);
            consoleLog(`=====================\n`);

            if (removed || added) {
              // Clear all caches (movies + series)
              window.jellyfinTheDwarfsHammer.clearCache();
              softRefreshMoviesList();
            }

            return { removed, added };
          } catch (error) {
            console.error("❌ Error syncing tags:", error);
            return { removed: 0, added: 0 };
          } finally {
            showSpinner(false);
          }
        }

        async function removeTagFromAllMovies(tagName) {
          consoleLog(`Removing tag "${tagName}" from all movies...`);

          const { userId } = getCredentials();

          try {
            const data = await apiRequest(
              `/Users/${userId}/Items?IncludeItemTypes=Movie&Recursive=true&Tags=${tagName}&Fields=Tags`
            );

            consoleLog(
              `Found ${data.TotalRecordCount} movies with tag "${tagName}"`
            );

            let removed = 0;
            let failed = 0;

            for (const movie of data.Items) {
              const success = await removeTagFromMovie(movie.Id, tagName);
              if (success) {
                removed++;
                consoleLog(`✓ Removed tag from: ${movie.Name}`);
                  // 👇 instantly remove from current Movies view if visible
                  //removeMovieCardFromUI(movie.Id);  // not needed here
              } else {
                failed++;
              }

              await new Promise((resolve) => setTimeout(resolve, 50));
            }

            consoleLog(`\n=== Tag Removal Complete ===`);
            consoleLog(`✓ Removed from: ${removed} movies`);
            if (failed > 0) {
              consoleLog(`✗ Failed: ${failed} movies`);
            }
            consoleLog(`============================\n`);

            return removed;
          } catch (error) {
            console.error("❌ Error removing tags:", error);
            return 0;
          }
        }

function isOnNotInCollectionView() {
  const hash = location.hash;
  const isMovieOrSeriesPage = hash.startsWith("#/movies") || hash.startsWith("#/tv");   consoleLog("key found 0:", isMovieOrSeriesPage, hash);
  if (!isMovieOrSeriesPage) return false;
  const userId = getCredentials().userId;
  
  // Check both possible keys
  const lsKeys = Object.keys(localStorage).filter(
    (k) =>
    k.startsWith(userId + "-") &&
    (k.endsWith("-movies-filter") || k.endsWith("-series-filter"))
  );
  consoleLog("key found 1:", lsKeys);

  for (const key of lsKeys) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      if (data.Tags?.includes("NotInCollection")) return true;
    } catch {}
  }

  return false;
}



        // ========================================
        // DASHBOARD ADMIN BUTTONS
        // ========================================

        async function injectDashboardButtons() {
          // Check if we're on the dashboard page
          if (!window.location.href.includes("dashboard")) return;

          if (!isAdmin) {
            consoleLog("User is not admin, skipping dashboard buttons");
            return;
          }

          const checkInterval = setInterval(() => {
            // Look for the MuiStack that contains the refresh button
            const targetStack = document.querySelector(
              '#dashboardPage .MuiStack-root:has(button [data-testid="RefreshIcon"])'
            );

            if (targetStack) {
              clearInterval(checkInterval);

              // Check if already injected
              if (document.getElementById("collectionFilterAdminButtons"))
                return;

              // Create button container that matches Jellyfin's style
              const buttonContainer = document.createElement("div");
              buttonContainer.id = "collectionFilterAdminButtons";
              buttonContainer.className = "MuiStack-root";
              buttonContainer.style.cssText = "display: flex; gap: 0.5em; margin-left: 0.5em;";
              const regularBtnCss = document.querySelector('.MuiButton-root:has([data-testid="RefreshIcon"])')?.className || 'MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary';
              const dangerBtnCss = document.querySelector('.MuiButton-root:has([data-testid="RestartAltIcon"])')?.className || 'MuiButtonBase-root MuiButton-root MuiButton-contained';

              buttonContainer.innerHTML = `
                <button id="btnTagNonCollectionMovies" type="button" class="${regularBtnCss.replace("Mui-disabled ", "")}" style="min-width: auto; padding: 6px 16px;">
                  <span class="button-text">Tag Non-Collection Movies</span>
                  <span class="button-spinner" style="display:none; margin-left:8px; width:16px; height:16px;">
                    <svg viewBox="0 0 50 50" style="width:16px; height:16px; animation: jellySpin 1s linear infinite;">
                      <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"
                        style="stroke-dasharray:90,150; stroke-dashoffset:0; animation:jellyDash 1.5s ease-in-out infinite"/>
                    </svg>
                  </span>
                </button>
                <button id="btnUntagAllMovies" type="button" class="${dangerBtnCss.replace("Mui-disabled ", "")}" style="min-width: auto; padding: 6px 16px; background-color: #d32f2f;" title="Remove All NotInCollection Tags">
                  <span class="button-text">Remove All Tags</span>
                  <span class="button-spinner" style="display:none; margin-left:8px; width:16px; height:16px;">
                    <svg viewBox="0 0 50 50" style="width:16px; height:16px; animation: jellySpin 1s linear infinite;">
                      <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"
                        style="stroke-dasharray:90,150; stroke-dashoffset:0; animation:jellyDash 1.5s ease-in-out infinite"/>
                    </svg>
                  </span>
                </button>
                <style>
                  @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                </style>
                <div class="chkContainer" id="enableRealTimeTagging"> 
                  <label class="emby-checkbox-label"> 
                    <input type="checkbox" is="emby-checkbox" class="emby-checkbox" data-embycheckbox="true"> <span class="checkboxLabel">Enable real time tagging</span> <span class="checkboxOutline">
                    <span class="material-icons checkboxIcon checkboxIcon-checked check" aria-hidden="true"></span><span class="material-icons checkboxIcon checkboxIcon-unchecked " aria-hidden="true"></span></span>
                  </label>  
                </div>
              `;

              // Insert after the existing buttons in the stack
              targetStack.appendChild(buttonContainer);
              initRealtimeToggle();
              //protectAdminButtons();

              // Attach event listeners
              const btnTag = document.getElementById(
                "btnTagNonCollectionMovies"
              );
              const btnUntag = document.getElementById("btnUntagAllMovies");

              btnTag.addEventListener("click", async () => {
                const btnText = btnTag.querySelector(".button-text");
                const spinner = btnTag.querySelector(".button-spinner");

                disableDashboardTagAllButtons(btnTag, btnUntag, spinner, btnText, "on");
                btnText.textContent = "Tagging...";

                try {
                  await tagAllNonCollectionMovies();
                  btnText.textContent = "Complete!";
                  setTimeout(() => {
                    btnText.textContent = "Tag Non-Collection Movies";
                  }, 3000);
                } catch (e) {
                  btnText.textContent = "Error";
                  setTimeout(() => {
                    btnText.textContent = "Tag Non-Collection Movies";
                  }, 3000);
                } finally {
                  disableDashboardTagAllButtons(btnTag, btnUntag, spinner, btnText, "off");
                }
              });


              btnUntag.addEventListener("click", async () => {
                if (!confirm('Remove ALL "NotInCollection" tags?')) return;

                const btnText = btnUntag.querySelector(".button-text");
                const spinner = btnUntag.querySelector(".button-spinner");

                disableDashboardTagAllButtons(btnTag, btnUntag, spinner, btnText, "on");
                btnText.textContent = "Removing...";

                try {
                  await removeTagFromAllMovies(CONFIG.tagName);
                  btnText.textContent = "Complete!";
                  setTimeout(() => {
                    btnText.textContent = "Remove All Tags";
                  }, 3000);
                } catch (e) {
                  btnText.textContent = "Error";
                  setTimeout(() => {
                    btnText.textContent = "Remove All Tags";
                  }, 3000);
                } finally {
                  disableDashboardTagAllButtons(btnTag, btnUntag, spinner, btnText, "off");
                }
              });

              const style = document.createElement("style");
              style.textContent = `
                @keyframes jellySpin {
                  100% { transform: rotate(360deg); }
                }
                @keyframes jellyDash {
                  0% { stroke-dasharray:1,200; stroke-dashoffset:0; }
                  50% { stroke-dasharray:90,150; stroke-dashoffset:-35; }
                  100% { stroke-dasharray:90,150; stroke-dashoffset:-125; }
                }
                #collectionFilterAdminButtons button {
                  display: inline-flex;
                  align-items: center;
                }
              `;
              document.head.appendChild(style);

              consoleLog("✓ Dashboard admin buttons injected");
            }
          }, 50);

          setTimeout(() => clearInterval(checkInterval), 10000);
        }

        function disableDashboardTagAllButtons(btnTag, btnUntag, spinner, btnText, state) {
          let disableOnly = false;
          if (!btnTag && !btnUntag && !spinner && !btnText) {
            btnTag = document.getElementById("btnTagNonCollectionMovies");
            btnUntag = document.getElementById("btnUntagAllMovies");
            spinner = btnTag?.querySelector(".button-spinner");
            btnText = btnTag?.querySelector(".button-text");
            disableOnly = true;
          }
          if (!btnTag || !btnUntag) return;

          if (state === "on") {
            btnTag.classList.add("Mui-disabled");
            btnUntag.classList.add("Mui-disabled");

            if (!disableOnly) {              
              if (spinner) spinner.style.display = "inline-block";
              if (btnText) btnText.textContent = "Working...";
            }
          }

          if (state === "off") {
            btnTag.classList.remove("Mui-disabled");
            btnUntag.classList.remove("Mui-disabled");

            if (spinner) spinner.style.display = "none";
          }
          return btnText;
        }


        // ========================================
        // UI INJECTION (Movies Filter)
        // ========================================

async function injectCustomCheckbox() {
  if (!USER_CONFIG?.features?.noCollectionFilter) return;
  
  // 1️⃣ Wait for the filter checkbox list (dialog UI)
  const checkboxList = await waitForElement(
    ".filterDialogContent .collapseContent .checkboxList",
    5000
  );
  if (!checkboxList) return;

  // 🔒 Hard guard (container-level, async-safe)
  if (checkboxList.dataset.notInCollectionInjected === "true") return;
  checkboxList.dataset.notInCollectionInjected = "true";

  // Extra safety (if Jellyfin cloned DOM)
  if (checkboxList.querySelector('[data-filter="IsNotCollection"]')) return;

  // 🎬 Detect if we're on TV/Series page
  const isSeriesPage = location.hash.startsWith("#/tv?");

  // 2️⃣ Wait for the real Jellyfin tag checkbox (Movies only)
  const jellyCheckboxEl = isSeriesPage ? null : await waitForElement(
    '.tagFilters .emby-checkbox[data-filter="NotInCollection"]',
    5000
  );

  let jellyChecked = false;
  if (jellyCheckboxEl) {
    jellyChecked = jellyCheckboxEl.checked;
  }

  // 3️⃣ Align to Jellifin checkbox if divergent
  let isChecked = localStorage.getItem(CONFIG.storageKey) === "true";
  if (jellyCheckboxEl && isChecked !== jellyChecked) {
    localStorage.setItem(CONFIG.storageKey, jellyChecked ? "true" : "false");
    isChecked = jellyChecked;
  }


  // 4️⃣ Inject your custom checkbox
  const checkboxHtml = `
    <label class="emby-checkbox-label">
      <input type="checkbox" is="emby-checkbox"
        class="chkStandardFilter chkFavorite emby-checkbox"
        data-embycheckbox="true"
        data-filter="IsNotCollection"
        ${isChecked ? "checked" : ""}>
      <span class="checkboxLabel">No collections</span>
      <span class="checkboxOutline">
        <span class="material-icons checkboxIcon checkboxIcon-checked check" aria-hidden="true"></span>
        <span class="material-icons checkboxIcon checkboxIcon-unchecked" aria-hidden="true"></span>
      </span>
    </label>
  `;

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = checkboxHtml;
  const customCheckbox = tempDiv.firstElementChild;
  const customCheckboxInput = customCheckbox.querySelector('input[data-filter="IsNotCollection"]');
  
  checkboxList.appendChild(customCheckbox);
  consoleLog("✓ Custom checkbox injected");

  // 5️⃣ Attach event listener based on page type
  if (isSeriesPage) {
    // 📺 SERIES: Use show/hide filter
    customCheckboxInput.addEventListener("change", async () => {
      const isChecked = customCheckboxInput.checked;
      
      // Save state
      localStorage.setItem(CONFIG.storageKey, isChecked ? "true" : "false");
      
      // Apply series filter   // when on collection tab do nothing, for noUpdateCardsOnChangefilter
      JFC_SHOWS.currentMode = JFC_SHOWS.currentMode === "collections" ? "collections" : isChecked ? "no-collections" : "all";
      await buildSeriesCollectionsIndex();
      applySeriesFilter(isChecked);
      
      consoleLog(`📺 Series "No collections" filter: ${isChecked ? "ON" : "OFF"}`);
    });
    
    consoleLog("✓ Series filter event attached");
    
  } else {
    // 🎬 MOVIES: Keep them in sync with Jellyfin tag filter
    if (jellyCheckboxEl) {
      const syncFromJellyfin = () => {
        const jellyNow = jellyCheckboxEl.checked;
        const localNow = localStorage.getItem(CONFIG.storageKey) === "true";
        if (jellyNow !== localNow) {
          localStorage.setItem(CONFIG.storageKey, jellyNow ? "true" : "false");
        }
      };

      jellyCheckboxEl.addEventListener("change", syncFromJellyfin);

      const guard = setInterval(() => {
        if (!document.body.contains(jellyCheckboxEl)) {
          clearInterval(guard);
          consoleLog("♻ Jellyfin filter rebuilt, reinjecting custom checkbox");
          injectCustomCheckbox();
        }
      }, 500);
    }
    
    consoleLog("✓ Movies filter sync attached");
  }
}


        function waitForElement(selector, timeout = 10000) {
          return new Promise(resolve => {
            const found = document.querySelector(selector);
            if (found) return resolve(found);

            const obs = new MutationObserver(() => {
              const el = document.querySelector(selector);
              if (el) {
                obs.disconnect();
                resolve(el);
              }
            });

            obs.observe(document.body, { childList: true, subtree: true });

            if (timeout) {
              setTimeout(() => {
                obs.disconnect();
                resolve(null);
              }, timeout);
            }
          });
        }


        function injectResetButton() {
          const checkInterval = setInterval(() => {
            const filterDialogContent = document.querySelector(
              ".dialogContainer .filterDialogContent"
            );

            if (filterDialogContent) {
              clearInterval(checkInterval);

              if (document.querySelector(".btnReset")) return;

              const buttonHtml = `
                <div title="reset" class="flex align-items-center justify-content-center">
                  <button is="emby-button" type="button" class="raised button-reset block btnReset formDialogFooterItem emby-button">
                    <span>Reset</span>
                  </button>
                </div>
              `;

              const tempDiv = document.createElement("div");
              tempDiv.innerHTML = buttonHtml;
              filterDialogContent.appendChild(tempDiv.firstElementChild);

              const resetBtn = document.querySelector(".btnReset");
              resetBtn.addEventListener("click", clearAllFilters);

              consoleLog("✓ Reset button injected");
            }
          }, 50);

          setTimeout(() => clearInterval(checkInterval), 10000);
        }

        function bindFilterEvents() {
          const dialog = document.querySelector(".filterDialogContent");
          if (!dialog || dialog.dataset.notInCollectionBound) return;

          dialog.dataset.notInCollectionBound = "true";

          dialog.addEventListener("change", (event) => {
            const cb = event.target;

            if (
              cb.matches('[data-filter="IsNotCollection"]') ||
              cb.matches('[data-filter="NotInCollection"]')
            ) {
              handleFilterChange(event);
            }
          });

          consoleLog("✓ Filter dialog delegation active");
        }


        function handleFilterChange(event) {
          if (noScript) { 
            consoleLog("noScript ...");            
            return; 
          };
          const isChecked = event.target.checked;
          // ALWAYS persist an explicit value
          localStorage.setItem(CONFIG.storageKey, isChecked ? "true" : "false");

          const customFilterCheckbox = document.querySelector('[data-filter="IsNotCollection"]'); // checkbox under Filters

          if (isChecked) {
            if (event.target.closest('.tagFilters')) { // under Tags
              customFilterCheckbox.checked = true;
            }
            else { // under Filters
              applyTagFilter();
            }
          } else {
            if (event.target.closest('.tagFilters')) { // under Tags
              customFilterCheckbox.checked = false;
            }
            else { // under Filters
              removeTagFilter();
            }
          }
        }

        function applyTagFilter() {
          setTimeout(() => {
            const tagCheckboxes = document.querySelectorAll(
              'input[type="checkbox"]'
            );

            for (const checkbox of tagCheckboxes) {
              const label = checkbox.parentElement?.textContent || "";
              if (label.includes(CONFIG.tagName)) {
                if (!checkbox.checked) {
                  checkbox.click();
                  consoleLog("✓ Applied NotInCollection filter");
                }
                return;
              }
            }

            consoleLog("⚠ Tag filter not found - run syncTags() to update");
          }, 100);
        }

        function removeTagFilter() {
          setTimeout(() => {
            const tagCheckboxes = document.querySelectorAll(
              'input[type="checkbox"]'
            );

            for (const checkbox of tagCheckboxes) {
              const label = checkbox.parentElement?.textContent || "";
              if (label.includes(CONFIG.tagName) && checkbox.checked) {
                checkbox.click();
                consoleLog("✓ Removed NotInCollection filter");
                return;
              }
            }
          }, 100);
        }


/**********************
 * 🎬 Auto-tag watcher
 **********************/

async function autoTagNewMovies() {
  if (!IS_ADMIN) return;
  try {
    consoleLog("🕵️ Auto-tag sync running...");
    showSpinner();

    // disable buttons
    const btnText = disableDashboardTagAllButtons(null, null, null, null, "on");
    if (btnText) btnText.textContent = "Auto-tagging...";

    const collections = await getAllCollections(true); // force fresh
    const moviesInCollections = new Set();

    for (const c of collections) {
      const movies = await getMoviesInCollection(c.Id);
      movies.forEach(m => moviesInCollections.add(m.Id));
    }

    const allMovies = await getAllMovies();

    let added = 0;
    let removed = 0;

    for (const movie of allMovies) {
      const hasTag = (movie.Tags || []).includes(CONFIG.tagName);
      const isInCollection = moviesInCollections.has(movie.Id);

      if (!isInCollection && !hasTag) {
        if (await addTagToMovie(movie.Id, CONFIG.tagName)) {
          added++;
          consoleLog("✓ Tagged:", movie.Name);
        }
      }

      if (isInCollection && hasTag) {
        if (await removeTagFromMovie(movie.Id, CONFIG.tagName)) {
          removed++;
          consoleLog("✓ Untagged:", movie.Name);
        }
      }

      await new Promise(r => setTimeout(r, 40));
    }

    if (removed || added) {
      // Clear all caches (movies + series)
      window.jellyfinTheDwarfsHammer.clearCache();
      softRefreshMoviesList();
    }

    consoleLog(`✅ Sync done | +${added} / -${removed}`);
  } catch (e) {
    console.error("💥 Auto-tag sync error:", e);
  } finally {
    showSpinner(false);
    // reactivate buttons
    const btnText = disableDashboardTagAllButtons(null, null, null, null, "off");
    if (btnText) btnText.textContent = "Tag Non-Collection Movies";
  }
  
}




function isAdmin() {
  return Boolean(
    window.ApiClient?._currentUser?.Policy?.IsAdministrator
  );
}

function startAutoTagWatcher() {
  // prevent duplicates across navigation
  if (window.__jfcAutoTagInterval) return;

  const enabled = localStorage.getItem(CONFIG.realtimeTagging) === "true";
  if (!enabled) return;

  if (!IS_ADMIN) {
    consoleLog("⛔ Realtime tagging skipped (not admin)");
    return;
  }

  consoleLog("👁️ Starting realtime auto-tag watcher (admin)");

  // first delayed run (UI + auth fully ready)
  window.__jfcAutoTagTimeout = setTimeout(() => {
    autoTagNewMovies({ incremental: true });
  }, 15_000);

  // background loop
  window.__jfcAutoTagInterval = setInterval(() => {
    autoTagNewMovies({ incremental: true });
  }, CONFIG.autoTagInterval);
}

function stopAutoTagWatcher() {
  if (window.__jfcAutoTagTimeout) {
    clearTimeout(window.__jfcAutoTagTimeout);
    window.__jfcAutoTagTimeout = null;
  }

  if (window.__jfcAutoTagInterval) {
    clearInterval(window.__jfcAutoTagInterval);
    window.__jfcAutoTagInterval = null;
  }

  consoleLog("🛑 Realtime auto-tag watcher stopped");
}






function initRealtimeToggle() {
  const checkbox = document.querySelector("#enableRealTimeTagging .emby-checkbox"); 

  if (!checkbox) {
    console.warn("❌ Realtime tagging checkbox not found");
    return;
  }

  // Default = OFF unless explicitly enabled before
  const stored = localStorage.getItem(CONFIG.realtimeTagging);
  const enabled = stored === "true";

  checkbox.checked = enabled;

  consoleLog("⚡ Realtime tagging:", enabled ? "ENABLED" : "DISABLED");

  checkbox.addEventListener("change", () => {
    const isEnabled = checkbox.checked;

    localStorage.setItem(CONFIG.realtimeTagging, isEnabled);
    consoleLog("⚡ Realtime tagging toggled:", isEnabled);

    if (isEnabled) {
      startAutoTagWatcher();  // ✅
    } else {
      stopAutoTagWatcher();   // ✅
    }

  });

  // Auto-start if previously enabled
  if (enabled) {
    startAutoTagWatcher();  // ✅
  }
}



        // ========================================
        // EVENT MONITORING
        // ========================================
        let collectionSyncTimer = null;
        const COLLECTION_DEBOUNCE = 1200; // enough for Jellyfin to settle

       
        function showSpinner(show = true) {
          const sp = document.querySelector(".docspinner");
          if (sp) {
            if (show) {
              sp.classList.add("mdlSpinnerActive");
              sp.style.display = "flex";              
            }
            else {
              sp.classList.remove("mdlSpinnerActive");
              sp.style.display = "none";
            }
          }
        }

window.__jfcLastMovieId = null;

function watchCollectionEdits() {
  const originalFetch = window.fetch;

  window.fetch = function (...args) {
    const [url, options] = args;

    if (
      typeof url === "string" &&
      (url.includes("/Collections") || url.includes("/BoxSets")) &&
      options?.method &&
      options.method !== "GET"
    ) {
      consoleLog("🔔 Collection modified");

      clearTimeout(window.__jfcCollectionTimer);

      window.__jfcCollectionTimer = setTimeout(async () => {
        consoleLog("🧬 Resync after collection change (debounced)");

        await new Promise(r => setTimeout(r, 1200));

        // 👇 Clear BOTH caches (movies and series)
        localStorage.removeItem(CONFIG.collectionsCache);
        clearSeriesCollectionsCache();

        const movieId = window.__jfcLastMovieId;

        if (!movieId) {
          consoleLog("⚠️ No movie context → skipping targeted update");
          return;
        }

        // Decide action based on method
        let success = false;
        if (options.method.toUpperCase() === "POST") {
          success = await removeTagFromMovie(movieId, CONFIG.tagName);
          softRefreshMoviesList();
          consoleLog(success ? "✓ Tag removed from movie" : "✗ Tag removal failed", movieId);
        } else if (options.method.toUpperCase() === "DELETE") {
          success = await addTagToMovie(movieId, CONFIG.tagName);
          consoleLog(success ? "✓ Tag added to movie" : "✗ Tag addition failed", movieId);
        } else {
          consoleLog("ℹ️ Unknown collection operation, skipping tag update");
        }

      }, 800);
    }

    return originalFetch.apply(this, args);
  };
}



function watchForLibraryScan(onFinished) {
  let armed = false;
  let active = false;
  let progressObserver = null;

  function findScanButton() {
    return document.querySelector(
      '#dashboardPage button.MuiButton-root:has([data-testid="RefreshIcon"]), ' +
      '#mediaLibraryPage button.MuiButton-root:has([data-testid="RefreshIcon"])'
    );
  }

  function attachToButton() {
    const btn = findScanButton();
    if (!btn || btn.dataset.scanWatcher) return;

    btn.dataset.scanWatcher = "true";
    consoleLog("🧷 Scan button hooked");

    btn.addEventListener("click", () => {
      consoleLog("🖱 Scan button clicked");
      armed = true;
      waitForProgress();
    }, true);
  }

  function waitForProgress() {
    if (active) return;

    progressObserver = new MutationObserver(() => {
      const bar = document.querySelector(
        '#dashboardPage .MuiPaper-root .MuiBox-root .MuiLinearProgress-root, ' +
        '#mediaLibraryPage .MuiBox-root .MuiLinearProgress-root'
      );

      if (bar && !active) {
        active = true;
        // disable tagging buttons
        disableDashboardTagAllButtons(null, null, null, null, "on");
        consoleLog("🔄 Library scan started");
      }

      if (active && !bar) {
        consoleLog("📚 Library scan finished");

        progressObserver.disconnect();
        progressObserver = null;
        active = false;
        armed = false;

        if (typeof onFinished === "function") {
          onFinished();
        }
      }
    });

    progressObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Watch pages so button is always hooked
  const pageObserver = new MutationObserver(attachToButton);
  pageObserver.observe(document.body, { childList: true, subtree: true });

  // Initial attempt
  attachToButton();

  consoleLog("👀 Scan button watcher armed");
}


// ------------------------------
// On-demand "Which collections?" for a single movie
// ------------------------------

// cache movieId -> collection links
const collectionCache = {};

// ----------------------
// Watch for movie detail page
// ----------------------
let detailsObserver = null;

function watchDetailsPage(e) { consoleLog("watchDetailsPage", e?.type);

  if (!isDetailsPage()) {
    if (detailsObserver) {
      detailsObserver.disconnect();
      detailsObserver = null;
    }
    return;
  } 

  if (detailsObserver) return; // already watching

  detailsObserver = new MutationObserver(() => {
    // // this run on every navigation or close menu
    // if (noScript && !document.querySelector('.dialogContainer')) {   
    //   // fire close dialog event
    //   document.dispatchEvent(new CustomEvent("close-dialog", {
    //     detail: { reason: "navigation" }
    //   }));
    // }
    const detailsGroup = getActiveDetailsGroup();
    if (!detailsGroup) return;

    if (detailsGroup.querySelector("#collectionsGroupItem")) {
      // Already injected, no need to run again
      return;
    }

    if (detailsGroup) { consoleLog("hash change inject");
      if (USER_CONFIG.features.collectionsButton) {
        injectCollectionsButton();
      }
      
      if (USER_CONFIG.features.actorSearchMenu || USER_CONFIG.features.copyTitleMenu) {
        injectActorSearchMenu();
      }
      
      if (USER_CONFIG.features.missingEpisodes || USER_CONFIG.features.missingSeasons) {
        injectMissingEpisodes();
      }
    }
  });

  detailsObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}



// ----------------------
// Inject button into details page
// ----------------------
function injectCollectionsButton() { 

  const detailsGroup = getActiveDetailsGroup();
  if (!detailsGroup) return;

  if (!document.getElementById("collections-css")) {
    const style = document.createElement("style");
    style.id = "collections-css";
    style.textContent = `
      .collectionsGroup a,
      .collectionsGroup a:visited {
        color: var(--accentcolor, #00a4dc) !important;
      }
  
      .collectionsGroup a:hover {
        text-decoration: underline;
      }
      .detailsGroupItem .label{          
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style); getCurrentPageItem();
  }

  const movieId = getMovieIdFromUrl(); consoleLog("hash change inject 4", movieId);
  
  if (!movieId) return;

consoleLog("hash change inject 5");

  // Avoid injecting twice
  if (detailsGroup.querySelector("#collectionsGroupItem")) return;

  const groupItem = document.createElement("div");
  groupItem.id = "collectionsGroupItem";
  groupItem.className = "detailsGroupItem collectionsGroup";

  const label = document.createElement("div");
  label.className = "collectionsLabel label";
  label.textContent = "Collections";

  const content = document.createElement("div");
  content.className = "collections content focuscontainer-x";

  if (collectionCache[movieId]) {
    const links = collectionCache[movieId];
    content.innerHTML = links.length
      ? links.join(", ")
      : "<i>No collections found</i>";

    groupItem.appendChild(label);
    groupItem.appendChild(content);
    detailsGroup.appendChild(groupItem);
  }
  else { consoleLog("exist"); 
  
    const btn = document.createElement("button");
    btn.textContent = "Show Collections";
    btn.style.cursor = "pointer";
    btn.className = "emby-button button-link detailTrackSelect emby-select-withcolor";

    content.appendChild(btn);
    groupItem.appendChild(label);
    groupItem.appendChild(content);
    detailsGroup.appendChild(groupItem);

    btn.addEventListener("click", async () => { consoleLog("click btn collection");
    
      showSpinner();

      const links = await getMovieCollections(movieId);
      content.innerHTML = links.length
        ? links.join(", ")
        : "<i>No collections found</i>";

      showSpinner(false);
    });
  }

}

function isVisible(el) {
  if (!el) return false;

  // Fast rejects
  if (el.offsetParent === null) return false;

  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getActiveDetailsGroup() {
  const itemId = getMovieIdFromUrl();
  if (!itemId) return null;
consoleLog("hash change inject 1");
  const buttons = document.querySelectorAll(`button[data-id="${itemId}"]`);

  for (const btn of buttons) {
    if (!isVisible(btn)) continue;

    const page = btn.closest(".page, .libraryPage");
    if (!page) continue;

    const group = page.querySelector(".itemDetailsGroup");
    if (group) return group;
  }
  return null;
}

function getMovieIdFromUrl() {
  const match = location.hash.match(/[#?]\/details\?id=([a-f0-9]+)/i);
  return match ? match[1] : null;
}
function isDetailsPage() {
  return /[#?]\/details\?id=/.test(location.hash);
}
function buildDetailsLink(itemId) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const serverId = params.get("serverId");

  let url = `/web/?#/details?id=${itemId}`;
  if (serverId) url += `&serverId=${serverId}`;

  return url;
}
async function isMoviePage(quick = false) { // List Seasons of a Serie
  if (quick) return /[?#]\/movies\?/.test(location.hash);
  const item = await getCurrentPageItem(); 
  return item && item.Type === "Movie";
}
async function isSeriePage(quick = false) { // List Seasons of a Serie
  if (quick) return /[?#]\/tv\?/.test(location.hash);
  const item = await getCurrentPageItem();
  return item && item.Type === "Series";
}
async function isSeasonPage(quick) { // List Episodes of a Season
  // return document.querySelector('.page:not(.hide) .listItem[data-type="Episode"]');
  const item = await getCurrentPageItem();
  return item && item.Type === "Season";
}
async function isEpisodePage(quick) { // page of single episode
   const item = await getCurrentPageItem();
   return item && item.Type === "Episode";
}
async function getCurrentPageItem(u, p) {
  const userId = u || ApiClient._serverInfo.UserId;
  const pageItemId = p || getMovieIdFromUrl();

  const item = await ApiClient.getItem(userId, pageItemId);
  consoleLog("page item", item);
  return item
}


// ----------------------
// Get collections function
// Returns array of HTML links
// ----------------------
window.getMovieCollections = async function (movieId) {
  if (!movieId) return [];

  // Check cache
  if (collectionCache[movieId]) return collectionCache[movieId];

  try {
    const { accessToken } = getCredentials();
    if (!accessToken) return [];

    // 1️⃣ Fetch all BoxSet/Collections
    const url = `/Items?IncludeItemTypes=BoxSet&Recursive=true&Fields=Id,Name&api_key=${accessToken}`;
    const { Items: collections } = await fetch(url).then(r => r.json());

    const result = [];

    // fetch items per collection in parallel
    await Promise.all(collections.map(async (col) => {
      const colItemsUrl = `/Items?ParentId=${col.Id}&api_key=${accessToken}`;
      const { Items: colItems } = await fetch(colItemsUrl).then(r => r.json());

      if (colItems.some(i => i.Id === movieId)) {
        // Correct link to collection page
        const link = `<a href="${buildDetailsLink(col.Id)}" class="collection-link">${col.Name}</a>`;

        result.push(link);
      }
    }));

    collectionCache[movieId] = result;
    return result;

  } catch (err) {
    console.error("Error fetching collections:", err);
    return [];
  }
}

        let contextMenuAttached = false;
        function injectActorSearchMenu() {
          if (!USER_CONFIG.features.actorSearchMenu && !USER_CONFIG.features.copyTitleMenu) {
            return; // Don't attach if both features disabled
          }

          let lastActorName = null;
          let lastMovieTitle = null;
          let observer = null;
          if (contextMenuAttached) return;
          contextMenuAttached = true;   // 🔒 lock immediately

          consoleLog("🎬 Actor attached", contextMenuAttached);

          document.addEventListener("contextmenu", e => {
            lastActorName = null;
            lastMovieTitle = null; consoleLog("menu open", e.target, e.target.closest('.card[data-id]'));
            

              // 🎬 Movie card
            const movieCard = e.target.closest('.card[data-id]');
            if (movieCard) {
              window.__jfcLastMovieId = movieCard.getAttribute("data-id");
              consoleLog("🎯 Movie context captured:", window.__jfcLastMovieId, e.target);
            }

            // 🎭 Actor card
            const personLink = e.target.closest('.card')
              ?.querySelector('a.itemAction[data-type]:not([data-type="Season"]):not([data-type="CollectionFolder"])'); // Actor|Director|Writer|Producer|...

            if (personLink) {
              lastActorName = personLink.textContent.trim();
              consoleLog(`context ${personLink.dataset.type.toLowerCase()}...`, lastActorName);
            }


            // 🎬 Movie card
            const movie = e.target.closest('.card')
              ?.querySelector('a.itemAction[data-type="Movie"], a.itemAction[data-type="Series"]');


            if (movie) {
              lastMovieTitle = movie.textContent.trim();              
            }
          }, true);



          observer = new MutationObserver(() => {
            const scroller = document.querySelector(
              ".focuscontainer .actionSheetContent .actionSheetScroller"
            );
            consoleLog("menu open close", contextMenuAttached);
            if (!scroller) {
              contextMenuAttached = false;
              lastMovieTitle = null;
              lastActorName = null;
              return;
            }
            consoleLog("menu open in", contextMenuAttached);
            /* ==========================
              🎭 ACTOR GOOGLE SEARCH
            ========================== */
            let itemAdded = 0;

            if (USER_CONFIG.features.actorSearchMenu && lastActorName && !scroller.querySelector(".actorGoogleSearch")) {

              const actorName = lastActorName; // 🔒 freeze value for this menu

              const btn = document.createElement("button");
              btn.className = "listItem listItem-button actionSheetMenuItem emby-button actorGoogleSearch";

              const short =
                actorName.length > 28
                  ? actorName.slice(0, 25) + "…"
                  : actorName;

              btn.innerHTML = `
                <span class="actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons">search</span>
                <div class="listItemBody actionsheetListItemBody">
                  <div class="listItemBodyText actionSheetItemText">${short}</div>
                </div>
              `;

              btn.addEventListener("click", () => {
                if (!actorName) return;
                window.open(
                  "https://www.google.com/search?q=" + encodeURIComponent(actorName),
                  "_blank"
                );
              });

              scroller.appendChild(btn);
              itemAdded++;
              consoleLog("🎭 Google search added for:", actorName, lastActorName);
            }

            /* ==========================
              🎬 COPY MOVIE TITLE
            ========================== */

            let movieTitle = lastMovieTitle; 
            

            // 🧠 fallback: read title from the opened action sheet itself
            if (!movieTitle) {
              const titleNode =
                document.querySelector(".actionSheetContent .itemName") ||
                document.querySelector(".actionSheetContent .detailText");

              if (titleNode) {
                movieTitle = titleNode.textContent.trim();
              }
            }

            if (USER_CONFIG.features.copyTitleMenu && movieTitle && !scroller.querySelector(".copyMovieTitle")) {

              const titleToCopy = movieTitle;

              const copyBtn = document.createElement("button");
              copyBtn.className = "listItem listItem-button actionSheetMenuItem emby-button copyMovieTitle";

              copyBtn.innerHTML = `
                <span class="actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons">content_copy</span>
                <div class="listItemBody actionsheetListItemBody">
                  <div class="listItemBodyText actionSheetItemText">Copy title</div>
                </div>
              `;

              copyBtn.addEventListener("click", () => {
                if (!titleToCopy) return;

                try {
                  copyTextFallback(titleToCopy);
                  showJellyfinToast("Title copied successfully.");
                  consoleLog("📋 Copied:", titleToCopy);
                } catch (e) {
                  console.error("Clipboard failed:", e);
                  showJellyfinToast("Failed to copy title.");
                }
              });


              const copyStreamBtn = scroller.querySelector('button[data-id="copy-stream"]');
              const actorGoogleSearchBtn = scroller.querySelector('button.actorGoogleSearch');

              if (copyStreamBtn) {
                copyStreamBtn.after(copyBtn);
              } else if (actorGoogleSearchBtn) {
                actorGoogleSearchBtn.before(copyBtn);
              } else {
                scroller.appendChild(copyBtn);
              }
              itemAdded++;

              consoleLog("🎬 Copy title added:", titleToCopy);
            }

            if (itemAdded) {
              scroller.closest(".actionSheet").style.marginTop = `-${2.75 * itemAdded}em`;
            }

          });

          observer.observe(document.body, {
            childList: true,
            subtree: true
          });

          consoleLog("🎬 Actor search menu watcher active");
        }

        function copyTextFallback(text) {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          ta.style.pointerEvents = "none";

          document.body.appendChild(ta);
          ta.focus();
          ta.select();

          const ok = document.execCommand("copy");
          document.body.removeChild(ta);

          if (!ok) throw new Error("execCommand failed");
        }

        function showJellyfinToast(message, duration = 3000) {
          let container = document.querySelector(".toastContainer");
          if (!container) {
             container = document.createElement("div");
             container.className = "toastContainer";
             document.body.appendChild(container);
          }

          container.innerHTML = `<div class="toast toastVisible">${message}</div>`;

          setTimeout(() => {
            container.innerHTML = "";
          }, duration);
        }

// ========================================
// MOVIES UPCOMING FEATURE - WITH SUBTABS
// ========================================

const JFC_MOVIES = {
  currentTab: null,  // movies | suggestions | favorites | upcoming | genres
  currentTabView: "comingsoon", // "comingsoon" | "toprated"
  comingSoonVisible: 30,
  topRatedVisible: 30,
  isLoading: false
};

let comingSoonMoviesAll = [];
let topRatedMoviesAll = [];

// ========================================
// INJECT UPCOMING TAB
// ========================================
async function injectMoviesUpcomingTab() {
  const slider = document.querySelector('.headerTabs .emby-tabs-slider');
  if (!slider || slider.querySelector('#jfcMoviesUpcomingTab')) return;
  
  const isMoviesPage = await isMoviePage(true);
  if (!isMoviesPage) return;

  // Find Movies and Suggestions tabs
  const moviesTab = slider.querySelector('.emby-tab-button[data-index="0"]');
  const suggestionsTab = slider.querySelector('.emby-tab-button[data-index="3"]');
  if (!moviesTab || !suggestionsTab) return;

  // Clone tab to match Jellyfin styling
  const upcomingTab = suggestionsTab.cloneNode(true);
  upcomingTab.id = "jfcMoviesUpcomingTab";
  upcomingTab.dataset.index = "upcoming";
  upcomingTab.querySelector('.emby-button-foreground').textContent = "Upcoming";

  // Remove active state initially
  upcomingTab.classList.remove("emby-tab-button-active");

  // Handle upcoming tab click
  upcomingTab.addEventListener("click", async (e) => {
    e.preventDefault();
    
    JFC_MOVIES.currentTab = "upcoming";

    // Get/create main upcoming container
    const moviesContent = document.querySelector('#moviesPage #moviesTab.pageTabContent'); 
    if (!moviesContent) return;
    
    let upcomingContainer = moviesContent.parentElement.querySelector('#jfcMoviesUpcomingTabContent');
    
    if (!upcomingContainer) { 
      upcomingContainer = document.createElement("div");
      upcomingContainer.id = "jfcMoviesUpcomingTabContent";
      upcomingContainer.className = "pageTabContent";
      moviesContent.after(upcomingContainer);
      
      // Inject subtabs structure
      injectMoviesUpcomingSubtabs(upcomingContainer);
    }

    // Switch active tab button states
    document.querySelectorAll('.headerTabs .emby-tab-button')
      .forEach(t => t.classList.remove("emby-tab-button-active"));
    upcomingTab.classList.add("emby-tab-button-active");

    // sub pages
    // document.querySelectorAll('#moviesPage > .pageTabContent')
    //   .forEach(t => t.classList.remove("is-active"));
    // upcomingContainer.classList.add("is-active");
    updateVisibilityMoviesDom(undefined, upcomingContainer);
    // this fix subtab state issue
    if (hasTMDB) {
      setTimeout(() => {        
        upcomingContainer?.querySelector(`#jfcMoviesUpcomingSubTabs [data-view="${JFC_MOVIES.currentTabView}"]`)?.classList.add('emby-tab-button-active');
        // show upcoming subcontent
        const currentViewNamed = JFC_MOVIES.currentTabView == "toprated" ? "TopRated" : "ComingSoon";
        document.querySelector(`#jfcMoviesUpcomingTabContent .pageTabContent:not([id="jfc${currentViewNamed}Content"])`)?.classList.remove('is-active');
        document.querySelector(`#jfcMoviesUpcomingTabContent .pageTabContent[id="jfc${currentViewNamed}Content"]`)?.classList.add('is-active');      
      }, 10);
    } 


    // Use Jellyfin's .is-active system
    // moviesContent.classList.remove("is-active");
    
 
    // Load initial data if needed
    if (!comingSoonMoviesAll.length && !topRatedMoviesAll.length) {  
      await loadAllUpcomingMovies();
    }

    // Render current view
    renderCurrentMoviesView();
  });

  // Attach reset listener to Movies tab and other tabs
  // attachMoviesTabResetListener(moviesTab);
  watchForMoviesTabChanges();

  // Insert after Suggestions tab
  suggestionsTab.after(upcomingTab);

  consoleLog("✓ Movies 'Upcoming' tab injected");
}

// ========================================
// INJECT SUBTABS (Coming Soon + Top Rated)
// ========================================
function injectMoviesUpcomingSubtabs(upcomingContainer) { 
  if (!hasTMDB) return;
  if (!upcomingContainer) return;

  if (upcomingContainer.querySelector('#jfcMoviesUpcomingSubTabs')) { 
      upcomingContainer.querySelector(`#jfcMoviesUpcomingSubTabs [data-view="${JFC_MOVIES.currentTabView}"]`).classList.add('emby-tab-button-active');
    return;
  }

  upcomingContainer.classList.add('itemsContainer','padded-left','padded-right','vertical-wrap', 'centered');
  upcomingContainer.style.display = 'grid';

  const subTabsHtml = `
    <div id="jfcMoviesUpcomingSubTabs" class="headerTabs sectionTabs" style="margin-top: 1em; margin-bottom: 1.5em;">
      <div class="emby-tabs-slider flex">
        <button class="emby-tab-button emby-button emby-tab-button-active" data-view="comingsoon">
          <div class="emby-button-foreground">Coming Soon</div>
        </button>
        <button class="emby-tab-button emby-button" data-view="toprated">
          <div class="emby-button-foreground">Top Rated</div>
        </button>
        <div class="btnFilter-wrapper btnFilterWithIndicator"><div class="filterIndicator hide">!</div> 
          <button is="paper-icon-button-light" class="btnFilter autoSize paper-icon-button-light" title="Filter"><span class="material-icons filter_alt" aria-hidden="true"></span>
          </button> 
        </div>
      </div>
    </div>
    
    <div id="jfcComingSoonContent" class="pageTabContent is-active" style="margin-top: 1em;">
      <div style="text-align: center; padding: 2em;">
        <div class="mdlSpinner mdlSpinnerActive" style="width: 48px; height: 48px; margin: 0 auto;"></div>
        <p style="margin-top: 1em;">Loading coming soon movies...</p>
      </div>
    </div>
    
    <div id="jfcTopRatedContent" class="pageTabContent" style="margin-top: 1em;">
      <div style="text-align: center; padding: 2em;">
        <div class="mdlSpinner mdlSpinnerActive" style="width: 48px; height: 48px; margin: 0 auto;"></div>
        <p style="margin-top: 1em;">Loading top rated movies...</p>
      </div>
    </div>
  `;
  
  showMoviesUpcomingSubtabs(subTabsHtml); 
  
  
  // Attach subtab listeners
  const comingSoonBtn = upcomingContainer.querySelector('[data-view="comingsoon"]');
  const topRatedBtn = upcomingContainer.querySelector('[data-view="toprated"]');
  
  const switchSubTab = (btn, view) => { 
  
    // Update tab buttons
    [comingSoonBtn, topRatedBtn].forEach(b => 
      b.classList.remove('emby-tab-button-active')
    );    
    btn.classList.add('emby-tab-button-active');
    
    // Update content visibility using is-active
    const comingSoonContent = upcomingContainer.querySelector('#jfcComingSoonContent');
    const topRatedContent = upcomingContainer.querySelector('#jfcTopRatedContent');
    
    if (view === "comingsoon") {
      comingSoonContent.classList.add('is-active');
      topRatedContent.classList.remove('is-active');
    } else {
      comingSoonContent.classList.remove('is-active');
      topRatedContent.classList.add('is-active');
    }
    
    JFC_MOVIES.currentTabView = view;
  };
  
  comingSoonBtn.addEventListener('click', () => {
    switchSubTab(comingSoonBtn, "comingsoon");
  });
  
  topRatedBtn.addEventListener('click', () => {
    switchSubTab(topRatedBtn, "toprated");
  });
  
  upcomingContainer.querySelector(`#jfcMoviesUpcomingSubTabs [data-view="${JFC_MOVIES.currentTabView}"]`)?.classList.add('emby-tab-button-active');
  
  consoleLog("✓ Movies upcoming subtabs injected");
}

function showMoviesUpcomingSubtabs(subTabsHtml) {
  const upcomingTabContainer = document.querySelector('#jfcMoviesUpcomingTabContent');
  if (subTabsHtml) {    
    if (!upcomingTabContainer || upcomingTabContainer?.querySelector('#jfcMoviesUpcomingSubTabs')) return;
    upcomingTabContainer.innerHTML = subTabsHtml;
    
    upcomingTabContainer.querySelector('#jfcMoviesUpcomingSubTabs .btnFilter')?.addEventListener('click', () => {
      openUpcomingFilterDialog('movies'); // ← Pass 'movies'
    });
  }
  else{
    upcomingTabContainer?.querySelector('#jfcMoviesUpcomingSubTabs')?.classList.remove('hide');
  }
  updateUpcomingFilterIndicator('movies'); // ← Pass 'movies'
}


// ========================================
// LOAD ALL UPCOMING MOVIES DATA
// ========================================
async function loadAllUpcomingMovies() {
  if (JFC_MOVIES.isLoading) return;
  
  // Display message "no api key found"
  if (!hasTMDB) {
    showApiKeyWarning(document.querySelector('#jfcMoviesUpcomingTabContent'), 'movies');
    return;
  }              
      
  JFC_MOVIES.isLoading = true;
  showSpinner();
  
  try {
    // Fetch both datasets in parallel
    const [comingSoon, topRated] = await Promise.all([
      fetchComingSoonMovies(COMINGSOON_MAX),
      fetchTopRatedMovies(TOPRATED_MAX)
    ]);
    
    comingSoonMoviesAll = comingSoon;
    topRatedMoviesAll = topRated;
    
    consoleLog(`✅ Loaded ${comingSoon.length} coming soon + ${topRated.length} top rated movies`);
    
    // Render current view
    renderCurrentMoviesView();
    
  } catch (error) {
    console.error("❌ Error loading upcoming movies:", error);
  } finally {
    JFC_MOVIES.isLoading = false;
    showSpinner(false);
  }
}

// ========================================
// RENDER CURRENT VIEW
// ========================================
function renderCurrentMoviesView() {
  const comingSoonContent = document.querySelector('#jfcComingSoonContent');
  const topRatedContent = document.querySelector('#jfcTopRatedContent');
  
  consoleLog("🎬 Rendering current view:", JFC_MOVIES.currentTabView);
  consoleLog("📊 Coming Soon:", comingSoonMoviesAll.length, "Top Rated:", topRatedMoviesAll.length);
  
  // Always render both views when data is loaded
  if (comingSoonContent && comingSoonMoviesAll.length > 0) {
    renderComingSoonMovies(comingSoonContent);
  }
  
  if (topRatedContent && topRatedMoviesAll.length > 0) {
    renderTopRatedMovies(topRatedContent);
  }
}

async function batchCheckLibrary(tmdbIds, type = 'movie') { 
  const { userId } = getCredentials();
  if (!userId || !tmdbIds.length) return new Map();
  
  try {
    const itemType = type === 'movie' ? 'Movie' : 'Series';
    
    // Check cache first
    const cacheKey = type === 'movie' ? CONFIG.moviesCollectionsCache : CONFIG.seriesCollectionsCache;
    const cached = localStorage.getItem(cacheKey);
    
    let libraryItems = [];
    
    if (cached) {
      try {
        const { items, timestamp } = JSON.parse(cached);

        // Validate cache has proper data
        if (items && Array.isArray(items) && items.length > 0 && 
            Date.now() - timestamp < CONFIG.showsCollectionsCacheDuration) {
          consoleLog(`📦 Using cached ${type} library data (${items.length} items)`);
          libraryItems = items;
        }
      } catch (e) {}
    }
    
    
    // Fetch using ApiClient if no cache
    if (!libraryItems.length) {
      const data = await ApiClient.getItems(userId, {
        IncludeItemTypes: itemType,
        Recursive: true,
        Fields: "ProviderIds"
      });
      
      libraryItems = data.Items || [];
      
      // Cache it
      localStorage.setItem(cacheKey, JSON.stringify({
        items: libraryItems,
        timestamp: Date.now()
      }));
    }
    
    // Build TMDb ID -> Jellyfin ID map
    const libraryMap = new Map();
    libraryItems.forEach(item => {
      const tmdbId = item.ProviderIds?.Tmdb;
      if (tmdbId) {
        libraryMap.set(String(tmdbId), item.Id);
      }
    });
    
    consoleLog(`📚 Library indexed: ${libraryMap.size} ${type}s`, libraryMap);
    return libraryMap;
    
  } catch (error) {
    console.error("Error batch checking library:", error);
    return new Map();
  }
}

function dedupeById(items, idKey = 'id') {
  return Array.from(
    new Map(items.map(i => [i[idKey], i])).values()
  );
}

// ========================================
// FETCH COMING SOON MOVIES
// ========================================
async function fetchComingSoonMovies(limit = 100) {
  consoleLog("🎬 Fetching coming soon movies...");
try {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 12); // Next 6 months

    const todayStr = today.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];


    consoleLog(`📅 Fetching movies between ${todayStr} and ${futureStr}`);

    // Fetch upcoming movies
    // Calculate pages needed (TMDB returns 20 per page)
    const pagesNeeded = Math.ceil(limit / 20);
    // TMDB allows max 500 pages, but let's cap at 10 for safety (200 results)
    const pagesToFetch = Math.min(pagesNeeded, 20);
    
    const pages = Array.from({ length: pagesToFetch }, (_, i) => i + 1);

    const allPromises = pages.map(page =>
      secureTMDBFetch('discover/movie', {
        'language': 'en-US',
        'sort_by': 'popularity.desc',
        'primary_release_date.gte': todayStr,
        'primary_release_date.lte': futureStr,
        'include_adult': 'false',
        'region': 'US',
        'page': page.toString()
      })
    );


    const results = await Promise.all(allPromises);
    const flat = results.flatMap(r => r.results || []);
    const allMovies = dedupeById(flat, 'id'); // ✅ Dedupe/Deduplication by TMDB id   
    consoleLog(
      `🎯 TMDB dedupe: ${flat.length} → ${allMovies.length}`
    );


    consoleLog("🎬 Raw coming soon movies fetched:", allMovies.length, "pagesNeeded:", pagesNeeded, allMovies);

    // Format movies
    const formatted = allMovies.map(movie => ({
      tmdbId: movie.id,
      title: movie.title,
      summary: movie.overview,
      image: movie.backdrop_path ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}` : null,
      posterImage: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      popularity: movie.popularity || 0,
      voteCount: movie.vote_count || 0,
      rating: movie.vote_average || 0,
      releaseDate: movie.release_date,
      releaseDateObj: movie.release_date ? new Date(movie.release_date) : null,
      genres: (movie.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean),
      inLibrary: false,
      isComingSoon: true
    }));

    const now = new Date();

    const scored = formatted.map(m => {
    const daysUntilRelease = Math.max(
      1,
      Math.ceil((m.releaseDateObj - now) / (1000 * 60 * 60 * 24))
    );

    const languagePenalty =
      m.originalLanguage && m.originalLanguage !== 'en' ? 80 : 0;

    const contentScore =
      (Math.log10(m.popularity + 1) * 60) +
      (Math.log10(m.voteCount + 1) * 20) +
      (m.rating * 5) -
      Math.log(daysUntilRelease + 1) -
      languagePenalty;

    return {
      ...m,
      contentScore
    };
    });


    // Filter future releases only and sort by release date (soonest first)
    // const sorted = formatted
    //   // .filter(m => m.popularity > 15)   // buzz filter
    //     .filter(m => m.releaseDateObj)  // filter out movies without release date
    //     .filter(m => m.releaseDateObj > now)
    //     .sort((a, b) => b.popularity - a.popularity)
    //     .slice(0, limit);

    const sorted = scored
      .filter(m => m.image) // 🧹 marketing-quality filter
      .filter(m => m.releaseDateObj > now)
      .sort((a, b) => b.contentScore - a.contentScore)
      .slice(0, limit);

    consoleLog(`✅ Returning ${sorted.length} coming soon movies`, formatted);
    return sorted;

  } catch (error) {
    console.error("❌ Error fetching coming soon movies:", error);
    return [];
  }
}

// ========================================
// FETCH TOP RATED MOVIES
// ========================================
async function fetchTopRatedMovies(limit = 100) {
  consoleLog("⭐ Fetching top rated movies...");
try {
    const currentYear = new Date().getFullYear();
    const minYear = currentYear - 30;

    // Calculate pages needed (TMDB returns 20 per page)
    const pagesNeeded = Math.ceil(limit / 20);
    // TMDB allows max 500 pages, but let's cap at 10 for safety (200 results)
    const pagesToFetch = Math.min(pagesNeeded, 10);
    
    const pages = Array.from({ length: pagesToFetch }, (_, i) => i + 1);

    const allPromises = pages.map(page =>
      secureTMDBFetch('discover/movie', {
        'language': 'en-US',
        'sort_by': 'revenue.desc',
        'vote_count.gte': '200',
        'primary_release_date': `.gte=${minYear}-01-01`,
        'include_adult': 'false',
        'region': 'US',
        'page': page.toString()
      })
    );

    const results = await Promise.all(allPromises);
    const flat = results.flatMap(r => r.results || []);
    const allMovies = dedupeById(flat, 'id'); // ✅ Dedupe/Deduplication by TMDB id   
    consoleLog(
      `🎯 TMDB dedupe: ${flat.length} → ${allMovies.length}`
    );

    consoleLog("⭐ Raw top rated movies fetched:", allMovies.length);

    const formatted = allMovies.map(movie => ({
      tmdbId: movie.id,
      title: movie.title,
      summary: movie.overview,
      image: movie.backdrop_path ? `https://image.tmdb.org/t/p/w500${movie.backdrop_path}` : null,
      posterImage: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      rating: movie.vote_average,
      voteCount: movie.vote_count,
      popularity: movie.popularity,
      releaseDate: movie.release_date,
      releaseDateObj: movie.release_date ? new Date(movie.release_date) : null,
      genres: (movie.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean),
      weightedRating: getWeightedRating(movie, 300, 7),
      inLibrary: false,
      isTopRated: true
    }));

    const topRated = formatted
      .filter(m => m.rating > 0 && m.voteCount >= 200)
      .sort((a, b) => b.weightedRating - a.weightedRating)
      .slice(0, limit);

    // Batch check library (single request)
    const tmdbIds = topRated.map(m => m.tmdbId);
    const libraryMap = await batchCheckLibrary(tmdbIds, 'movie'); 


    topRated.forEach((movie, i) => {
      movie.topIndex = i + 1;
      movie.inLibrary = libraryMap.has(String(movie.tmdbId));
      if (movie.inLibrary) {
        movie.itemId = libraryMap.get(String(movie.tmdbId)); // For linking
      }
    });

    // Add topIndex to each movie
    topRated.forEach((movie, i) => {
      movie.topIndex = i + 1; // 1..100
    });

    consoleLog(`✅ Returning ${topRated.length} top rated movies, Limit: ${limit}`, topRated);
    return topRated;

  } catch (error) {
    console.error("❌ Error fetching top rated movies:", error);
    return [];
  }
}

// ========================================
// RENDER COMING SOON
// ========================================
function renderComingSoonMovies(container) {
  const filtered = applyUpcomingGenreFilter(comingSoonMoviesAll, 'movies');
  const visible = filtered.slice(0, JFC_MOVIES.comingSoonVisible);
  renderMoviesGrid(visible, container, "comingsoon");
  renderMoviesLoadMoreButton(container, visible.length, filtered.length, "comingsoon");
}

// ========================================
// RENDER TOP RATED
// ========================================
function renderTopRatedMovies(container) {
  const filtered = applyUpcomingGenreFilter(topRatedMoviesAll, 'movies');
  const visible = filtered.slice(0, JFC_MOVIES.topRatedVisible); 
  
  renderMoviesGrid(visible, container, "toprated");
  renderMoviesLoadMoreButton(container, visible.length, filtered.length, "toprated");
}

// ========================================
// RENDER MOVIES GRID (Shared)
// ========================================
function renderMoviesGrid(movies, container, type) {
  if (!hasTMDB) return;
  if (!movies || movies.length === 0) {
    container.innerHTML = `
      <div style="padding: 2em; text-align: center; color: #999;">
        <p>No movies found.</p>
      </div>
    `;
    return;
  }

  const cardStyle = detectActiveCardStyle(false);
  const classes = getCardClasses(cardStyle);
  const isListView = !!classes.isListView;

  consoleLog(`🎨 Using card style movie: ${cardStyle}`, isListView);
  /* ============================
      📃 LIST VIEW
  ============================ */
  if (isListView) {
    const listItems = movies.map(m => {
      const imageUrl = m.posterImage || m.image || '';
      const tmdbLink = `https://www.themoviedb.org/movie/${m.tmdbId}`;

      let timeInfo = '';
      if (m.isComingSoon && m.releaseDateObj) {
        const days = Math.ceil((m.releaseDateObj - new Date()) / 86400000);
        timeInfo = days === 0 ? "Today" :
                   days === 1 ? "Tomorrow" :
                   days > 1 ? `In ${days} days` :
                   m.releaseDate;
      } else {
        timeInfo = m.releaseDate || 'Unknown';
      }


      return `
        <div class="listItem listItem-border">
          <div class="listItemImage itemAction lazy"
               onclick="window.open('${tmdbLink}','_blank')"
               style="background-image:url('${imageUrl}');cursor:pointer;">
          </div>

          <div class="listItemBody itemAction"
               onclick="window.open('${tmdbLink}','_blank')"
               style="cursor:pointer;">
            <div class="listItemBodyText"><bdi>${m.title}</bdi></div>
            <div class="secondary listItemBodyText">${timeInfo}</div>
          </div>

          <div class="secondary listItemMediaInfo">
            ${m.rating ? `
              <div class="starRatingContainer mediaInfoItem">
                <span class="material-icons starIcon star"></span>${m.rating.toFixed(1)}
              </div>` : ''}
          </div>

          <div class="listViewUserDataButtons">
            <button type="button"
              class="listItemButton paper-icon-button-light emby-button"
              onclick="window.open('${tmdbLink}','_blank')"
              title="View on TMDB">
              <span class="material-icons open_in_new"></span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="itemsContainer vertical-list">${listItems}</div>`;
    return;
  }

  /* ============================
      🖼 CARD VIEW
  ============================ */
  const cards = movies.map(m => {
  
    let timeInfo = '';
    if (m.isComingSoon && m.releaseDateObj) {
      const days = Math.ceil((m.releaseDateObj - new Date()) / 86400000);
      timeInfo = days === 0 ? "Today" :
                 days === 1 ? "Tomorrow" :
                 days > 1 ? `In ${days} days` :
                 m.releaseDate;
    } else {
      const year = m.releaseDateObj ? m.releaseDateObj.getFullYear() : '';
      timeInfo = year || m.releaseDate || 'Unknown';
    }

    const imageUrl = (cardStyle === 'poster' || cardStyle === 'posterCard')
      ? (m.posterImage || m.image)
      : (m.image || m.posterImage);

    const tmdbLink = `https://www.themoviedb.org/movie/${m.tmdbId}`;
    const boxClass = classes.hasVisualBox ? 'visualCardBox' : 'cardBox cardBox-bottompadded';

    const ratingBadge = m.rating ? `
      <div style="position:absolute;top:.5em;left:.5em;background:rgba(0,0,0,.8);padding:.3em .6em;border-radius:3px;font-size:.85em;z-index:2;">
        <span class="material-icons" style="font-size:1em;vertical-align:middle;color:#ffc107;">star</span>
        <span style="margin-left:.2em;">${m.rating.toFixed(1)}</span>
      </div>` : '';

    // Index badge for Top Rated movies
    const indexBadge = m.topIndex ? `
      <div style="
        position: absolute;
        top: 0.5em;
        right: 0.5em;
        background: linear-gradient(135deg, #c9a227, #ffeb7a);
        color: #000;
        padding: 0.3em 0.6em;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 700;
        z-index: 2;
        box-shadow: 0 0 6px rgba(0,0,0,0.6);
      ">
        #${m.topIndex}
      </div>
    ` : '';

    const libraryBadge = m.inLibrary ? `
      <div style="position: absolute; bottom: 0.5em; right: 0.5em; background: rgba(0,0,0,0.8); padding: 0.3em 0.6em; border-radius: 4px; font-size: 0.85em; z-index: 2;">
        <span class="material-icons" style="font-size: 1em; vertical-align: middle; color: #52c41a;">check_circle</span>
        <span style="vertical-align: middle; margin-left: 0.2em;">In Library</span>
      </div>
    ` : '';

//
    return `
      <div class="${classes.card}" style="min-width:15em;">
        <div class="${boxClass}">
          <div class="${classes.scalable}">
            <div class="${classes.padder}"></div>

            <a href="${(m.inLibrary && m.itemId) ? `/web/index.html#!/details?id=${m.itemId}` : tmdbLink}"
              ${!(m.inLibrary && m.itemId) ? 'target="_blank" rel="noopener"' : ''}
              class="cardImageContainer coveredImage"
              style="position:absolute;inset:0;">

              <div class="${classes.image}"
                   style="background-image:url('${imageUrl}');
                          background-size:cover;
                          background-position:center;
                          width:100%;height:100%;"></div>

              <div class="cardOverlayContainer itemAction">
                <button is="paper-icon-button-light"
                        class="cardOverlayButton cardOverlayButton-hover itemAction paper-icon-button-light cardOverlayFab-primary"
                        onclick="
                          event.stopPropagation();
                          event.preventDefault();
                          playMovieTrailer('${m.tmdbId}','${String(m.title).replace(/'/g,"\\'")}','${m.releaseDateObj ? m.releaseDateObj.getFullYear() : ''}');
                        "
                        title="Play trailer">
                  <span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover play_arrow"></span>
                </button>
                ${ratingBadge}
                ${indexBadge}
                ${libraryBadge}
              </div>
            </a>
          </div>

          <div class="${classes.footer}">
            <a href="${tmdbLink}"
              target="_blank"
              rel="noopener"
              class="jfcOnlineBadge"
              title="Open on TMDB" style="color: inherit; text-decoration: none;">
              <div class="cardText cardTextCentered">${m.title}</div>
              <div class="cardText cardText-secondary cardTextCentered" style="display: flex; align-items: center; justify-content: center; gap: 0.5em;">
                <span style="color:${m.isComingSoon ? '#52c41a' : '#999'};">
                  ${timeInfo}
                </span>
                <div class="itemExternalLinks focuscontainer-x" style="margin:.7em 0;font-size:92%">
                  <a is="emby-linkbutton" class="button-link emby-button" 
                    href="${tmdbLink}" 
                    target="_blank"
                    title="Open on TMDB" 
                    onclick="event.stopPropagation();"
                    style="padding: 0.2em 0.5em; font-size: 0.8em; min-height: unset;">
                    TMDB
                  </a>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="itemsContainer vertical-wrap focuscontainer-x"
         style="display:flex;flex-wrap:wrap;gap:1em;">
      ${cards}
    </div>
  `;
}

// ========================================
// LOAD MORE BUTTON
// ========================================
function renderMoviesLoadMoreButton(container, visible, total, type) {
  const remaining = total - visible;
  if (remaining <= 0) return;

  const btnContainer = document.createElement("div");
  btnContainer.className = "mainDetailButtons";
  btnContainer.style.cssText = "text-align:center; margin-top:2em;";

  const btn = document.createElement("button");
  btn.className = "loadMoreBtn emby-button raised";
  btn.textContent = `Load More (${remaining} remaining)`;

  btn.onclick = () => {
    if (type === "comingsoon") {
      JFC_MOVIES.comingSoonVisible = total; // Show ALL remaining
      const container = document.querySelector('#jfcComingSoonContent');
      if (container) renderComingSoonMovies(container);
    } else if (type === "toprated") {
      JFC_MOVIES.topRatedVisible = total; // Show ALL remaining
      const container = document.querySelector('#jfcTopRatedContent');
      if (container) renderTopRatedMovies(container);
    }
  };

  btnContainer.appendChild(btn);
  container.appendChild(btnContainer);
}

// ========================================
// RESET TO MOVIES TAB
// ========================================
function attachMoviesTabResetListener(moviesTab) {
  if (moviesTab.dataset.jfcMoviesReset) return;
  moviesTab.dataset.jfcMoviesReset = "true";

  moviesTab.addEventListener("click", () => {
    const upcomingTab = document.querySelector('#jfcMoviesUpcomingTab');
    const moviesContent = document.querySelector('#moviesPage #moviesTab.pageTabContent');
    const upcomingContainer = document.querySelector('#jfcMoviesUpcomingTabContent');

    if (upcomingTab) {
      upcomingTab.classList.remove("emby-tab-button-active");
    }

    if (moviesContent) {
      moviesContent.classList.add("is-active");
    }

    if (upcomingContainer) {
      upcomingContainer.classList.remove("is-active");
    }

    JFC_MOVIES.currentTabView = "comingsoon";
    JFC_MOVIES.comingSoonVisible = 30;
    JFC_MOVIES.topRatedVisible = 30;

    consoleLog("🔄 Movies tab clicked → reset");
  });
}

// ========================================
// WATCH OTHER TABS
// ========================================
function watchForMoviesTabChanges() { // :not(#jfcMoviesUpcomingTab):not([data-index="0"])
  const tabButtons = document.querySelectorAll('.headerTabs .emby-tab-button:not(#jfcMoviesUpcomingTab)');
  
  tabButtons.forEach(tab => {
    // Skip Shows and Collections tabs (already handled)
    // if (tab.dataset.jfcResetAttached) return;    
    // tab.dataset.jfcResetAttached = "true";
    
    tab.addEventListener("click", () => {
      // Reset filter when switching to other tabs
      const page = document.querySelector('#moviesPage');
      let pageContainer;
      if (page) {
        // document.querySelectorAll('#moviesPage > .pageTabContent').forEach(p => {
        //   p.classList.remove("is-active");
        // });
        // document.querySelectorAll('#jfcMoviesUpcomingTabContent > .pageTabContent').forEach(p => {
        //   p.classList.remove("is-active");
        // });
        
        // if (tab.dataset.index === "upcoming") {
        //   JFC_MOVIES.currentTab = "upcoming";
        //   pageContainer = document.querySelector('#jfcMoviesUpcomingTabContent');
        // }
        if(tab.dataset.index === "0") {
          JFC_MOVIES.currentTab = "movies";
          pageContainer = document.querySelector('#moviesTab');
        }
        else if(tab.dataset.index === "1") {
          JFC_MOVIES.currentTab = "suggestions";
          pageContainer = document.querySelector('#suggestionsTab');
        }
        else if(tab.dataset.index === "2") {
          JFC_MOVIES.currentTab = "favorites";
          pageContainer = document.querySelector('#favoritesTab');
        }
        else if(tab.dataset.index === "3") {
          JFC_MOVIES.currentTab = "collections";
          pageContainer = document.querySelector('#collectionsTab');
        }
        else if(tab.dataset.index === "4") {
          JFC_MOVIES.currentTab = "genres";
          pageContainer = document.querySelector('#genresTab');
        }

        document.querySelectorAll('#moviesPage .pageTabContent').forEach(t => {
          t.classList.remove("is-active");
        });

        

        if (pageContainer) {
          updateVisibilityMoviesDom(page, pageContainer);
        }

        if (document.querySelector('#moviesPage #jfcUpcomingSeriesContent')) {          
          injectMoviesUpcomingSubTabs();
        }
        consoleLog("🔄 Switched to different tab → filter reset");
      }
    });
  });
}

function updateVisibilityMoviesDom(page = document.querySelector('#moviesPage'), pageContainer) {
  setTimeout(() => {    
    document.querySelectorAll('#moviesPage .pageTabContent').forEach(t => {
      t.classList.remove("is-active");
    });
    page.dataset.activePage = JFC_MOVIES.currentTab;
    pageContainer.classList.add("is-active");
    pageContainer.dataset.page = JFC_MOVIES.currentTab;
    page.dataset.jfcFilterMode = localStorage.getItem(CONFIG.storageKey) === "true" ? "no-library" : "all";
    JFC_MOVIES.currentMode = page.dataset.jfcFilterMode;
  }, 10);
}
// ========================================
// PLAY MOVIE TRAILER
// ========================================
async function playMovieTrailer(tmdbId, movieTitle, year = '') {
try {
    const data = await secureTMDBFetch(`movie/${tmdbId}/videos`, {
      'language': 'en-US'
    });

    const trailer = pickBestTrailer(data.results); 

    if (!trailer) {
      const searchTitle = year ? `${movieTitle} (${year})` : movieTitle;
      const q = encodeURIComponent(`${searchTitle} official trailer`);
      window.open(`https://www.youtube.com/results?search_query=${q}`, "_blank");
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'dialogContainer';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;';

    const origin = encodeURIComponent(location.origin);

    modal.innerHTML = `
      <div style="position:relative; width:90%; max-width:1200px; aspect-ratio:16/9;">
        <button onclick="this.closest('.dialogContainer').remove()" 
                style="position:absolute; top:-40px; right:0; background:none; border:none; color:white; font-size:2em; cursor:pointer; z-index:1;">
          ✕
        </button>
        <iframe
          id="player"
          width="100%"
          height="100%"
          frameborder="0"
          allowfullscreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&playsinline=1&modestbranding=1&rel=0&origin=${origin}">
        </iframe>
            <div style="margin-top:8px; text-align:center; color:#fff; font-size:0.9em;">
      If video cannot play, <a href="https://www.youtube.com/watch?v=${trailer.key}" target="_blank" style="color:#52c41a;opacity:0.7;">watch on YouTube</a>
    </div>
      </div>
    `;

    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

  } catch (err) {
    console.error('❌ playMovieTrailer error:', err);
    alert("Failed to load trailer");
  }
}

window.playMovieTrailer = playMovieTrailer;


// ========================================
// SERIES FEATURES
// ========================================

const JFC_SHOWS = {
  seriesInCollections: new Set(),
  currentMode: "all",
  isIndexing: false,
  totalSeriesCount: 0  // 👈 Add this
};

// ========================================
// CORE: BUILD SERIES INDEX (with caching)
// ========================================

/**
 * Build index of series that are in collections
 * Fetches all BoxSets, then checks which visible series are in them
 * Uses cache if available and valid
 */
async function buildSeriesCollectionsIndex(forceRefresh = false) {
  if (JFC_SHOWS.isIndexing) return;
  JFC_SHOWS.isIndexing = true;

  const { userId, accessToken } = getCredentials();
  
  try {
    // Get visible series cards on current page
    const cards = document.querySelectorAll('#tvRecommendedPage #seriesTab [data-isfolder="true"][data-id][data-type="Series"]');
    const visibleSeriesIds = new Set([...cards].map(c => c.dataset.id).filter(Boolean));
    
    if (!visibleSeriesIds.size) {
      consoleLog("📺 No series found on page");
      JFC_SHOWS.isIndexing = false;
      return;
    }

    // 👇 Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = localStorage.getItem(CONFIG.seriesCollectionsCache);
      if (cached) {
        try {
          const { allSeriesInCollections, timestamp } = JSON.parse(cached);
          const cacheAge = Date.now() - timestamp;

          if (cacheAge < CONFIG.showsCollectionsCacheDuration) {
            consoleLog(`📦 Using cached series collections (${Math.floor(cacheAge / 1000)}s old)`);
            
            // Filter cached data to only visible series
            JFC_SHOWS.seriesInCollections.clear();
            allSeriesInCollections.forEach(seriesId => {
              if (visibleSeriesIds.has(seriesId)) {
                JFC_SHOWS.seriesInCollections.add(seriesId);
              }
            });

            consoleLog(`📦 Series in collections: ${JFC_SHOWS.seriesInCollections.size} / ${visibleSeriesIds.size}`);
            JFC_SHOWS.isIndexing = false;
            return;
          }
        } catch (e) {
          console.warn("⚠️ Cache parse failed, rebuilding...");
        }
      }
    }

    // 👇 No cache or force refresh - fetch from server
    consoleLog("🔄 Fetching series collections from server...");

    // Step 1: Fetch all BoxSets (collections)
    const boxSetsResponse = await fetch(
      `/Users/${userId}/Items?IncludeItemTypes=BoxSet&Recursive=true`,
      { headers: { "X-Emby-Token": accessToken } }
    );

    if (!boxSetsResponse.ok) throw new Error("Failed to fetch BoxSets");

    const boxSetsData = await boxSetsResponse.json();
    const boxSets = boxSetsData.Items || [];

    consoleLog(`📦 Found ${boxSets.length} BoxSets`);

    // Step 2: For each BoxSet, fetch Series inside it
    const allSeriesInCollections = new Set();

    for (const boxSet of boxSets) {
      const seriesResponse = await fetch(
        `/Users/${userId}/Items?ParentId=${boxSet.Id}&IncludeItemTypes=Series`,
        { headers: { "X-Emby-Token": accessToken } }
      );

      if (!seriesResponse.ok) continue;

      const seriesData = await seriesResponse.json();
      const seriesInThisBoxSet = seriesData.Items || [];

      // Add ALL series to cache (not just visible ones)
      seriesInThisBoxSet.forEach(series => {
        allSeriesInCollections.add(series.Id);
      });
    }

    // 👇 Save to cache
    localStorage.setItem(CONFIG.seriesCollectionsCache, JSON.stringify({
      allSeriesInCollections: [...allSeriesInCollections],
      timestamp: Date.now()
    }));

    consoleLog(`💾 Cached ${allSeriesInCollections.size} series in collections`);

    // Filter to only visible series for current use
    JFC_SHOWS.seriesInCollections.clear();
    allSeriesInCollections.forEach(seriesId => {
      if (visibleSeriesIds.has(seriesId)) {
        JFC_SHOWS.seriesInCollections.add(seriesId);
      }
    });

    consoleLog(`📦 Series in collections: ${JFC_SHOWS.seriesInCollections.size} / ${visibleSeriesIds.size}`);

  } catch (error) {
    console.error("❌ Failed to build series index:", error);
  } finally {
    JFC_SHOWS.isIndexing = false;
  }
}


// ========================================
// CACHE MANAGEMENT FUNCTIONS
// ========================================

/**
 * Clear series collections cache
 * Call this when collections are modified
 */
function clearSeriesCollectionsCache() {
  localStorage.removeItem(CONFIG.seriesCollectionsCache);
  consoleLog("🗑️ Series collections cache cleared");
}

/**
 * Force refresh series collections (ignores cache)
 */
async function refreshSeriesCollections() {
  consoleLog("🔄 Force refreshing series collections...");
  clearSeriesCollectionsCache();
  await buildSeriesCollectionsIndex(true);
  applySeriesFilter();
  consoleLog("✅ Series collections refreshed");
}

// ========================================
// FILTER: APPLY SHOW/HIDE LOGIC
// ========================================

function applySeriesFilter(isChecked) {
  const page = document.querySelector('#tvRecommendedPage'); consoleLog("applySeriesFilter...", JFC_SHOWS.currentMode);
  if (!page) return;

   // Only skip if not on Collections tab AND feature disabled
  let indicatorShouldUpdate = true;
  if (JFC_SHOWS.currentMode !== "collections" && !USER_CONFIG?.features?.noCollectionFilter) {
    JFC_SHOWS.currentMode = "all";  // disable noCollection filtering on Shows tab
    indicatorShouldUpdate = false;
  }
  
  const cards = document.querySelectorAll('#tvRecommendedPage #seriesTab [data-isfolder="true"][data-id][data-type="Series"]');
  let visibleCount = 0;
  let isCollection = false;

  // Update total based on current cards (in case page changed)
  JFC_SHOWS.totalSeriesCount = cards.length;

  const noUpdateCardsOnChangefilter = JFC_SHOWS.currentMode === "collections"; consoleLog("noUpdateCardsOnChangefilter", noUpdateCardsOnChangefilter);
  
  // Set page attribute based on current mode
  page.dataset.jfcFilterMode = JFC_SHOWS.currentMode;

  // Mark cards with collection status
  cards.forEach(card => {
    const seriesId = card.dataset.id; 
    if (!seriesId) return;
    
    const inCollection = JFC_SHOWS.seriesInCollections.has(seriesId);
    isCollection = isCollection || inCollection;
    
    // Add data attribute to card for CSS targeting
    // if (!noUpdateCardsOnChangefilter) { 
      card.dataset.jfcInCollection = inCollection ? "true" : "false";
    // }
    
    // Count visible based on current mode
    let shouldBeVisible = true;
    if (JFC_SHOWS.currentMode === "collections") {
      shouldBeVisible = inCollection;
    } else if (JFC_SHOWS.currentMode === "no-collections") {
      shouldBeVisible = !inCollection;
    }
    
    if (shouldBeVisible) visibleCount++;
  });
  updateSeriesPaging(visibleCount);
  consoleLog(`🎛 Series filter applied: ${JFC_SHOWS.currentMode} (${visibleCount} visible)`);

  // show filter indicator
  if (indicatorShouldUpdate) {    
    updateFilterIndicator(isCollection, isChecked);
  }

}

function updateFilterIndicator(isCollection, isChecked) {
  if (JFC_SHOWS.currentMode === "no-collections" && isCollection || JFC_SHOWS.currentMode === "collections" && isCollection && isChecked !== false) {
    const indicatorContainer = document.querySelector('#tvRecommendedPage #seriesTab .flex .btnFilter-wrapper');
    if (indicatorContainer) {  
      if (!indicatorContainer.querySelector('.filterIndicator')) {        
        indicatorContainer.insertAdjacentHTML('afterbegin', '<div class="filterIndicator">!</div>');    
      }
      else{
        indicatorContainer.querySelector('.filterIndicator').classList.remove('hide');
      }
      indicatorContainer.classList.add('btnFilterWithIndicator');
    }
  }
  else if (isChecked === false) {
    const indicatorContainer = document.querySelector('#tvRecommendedPage #seriesTab  .flex .btnFilter-wrapper');
    if (indicatorContainer && indicatorContainer.querySelector('.filterIndicator') && !isOtherFilterActive()) {    
      indicatorContainer.querySelector('.filterIndicator').classList.add('hide');      
    }
  }
}

function isOtherFilterActive() {
  return document.querySelectorAll('.filterDialogContent input.emby-checkbox:checked:not([data-filter="IsNotCollection"])').length > 0;
}


// ========================================
// CSS: INJECT FILTER STYLES
// ========================================
function injectSeriesFilterStyles() {
  if (document.getElementById('jfcSeriesFilterStyles')) return;

  const style = document.createElement('style');
  style.id = 'jfcSeriesFilterStyles';
  style.textContent = `
    /* Hide series NOT in collections when Collections tab is active */
    #tvRecommendedPage[data-jfc-filter-mode="collections"] [data-isfolder="true"][data-type="Series"][data-jfc-in-collection="false"] {
      display: none !important;
    }
      
    /* Hide series IN collections when "No collections" filter is active */
    #tvRecommendedPage[data-jfc-filter-mode="no-collections"] [data-isfolder="true"][data-type="Series"][data-jfc-in-collection="true"] {
      display: none !important;
    }
    .filterIndicator {
      pointer-events: none;
    }
  `;
  
  document.head.appendChild(style);
  consoleLog("✓ Series filter CSS injected");
}

function updateSeriesPaging(visibleOnPage) {
  const topPaging = document.querySelector('#seriesTab .flex:has(.btnFilter) .paging span');
  const bottomPaging = document.querySelector('#seriesTab > .flex:last-of-type .paging span');

  // Use the total we counted from actual cards
  const total = JFC_SHOWS.totalSeriesCount || visibleOnPage;

  // Build new paging text
  let newPagingText;
  if (visibleOnPage === 0) {
    newPagingText = `0 of ${total}`;
  } else if (visibleOnPage === 1) {
    newPagingText = `1 of ${total}`;
  } else {
    newPagingText = `1-${visibleOnPage} of ${total}`;
  }

  // Update both paging locations
  if (topPaging) topPaging.textContent = newPagingText;
  if (bottomPaging) bottomPaging.textContent = newPagingText;

  consoleLog(`📄 Paging updated: ${newPagingText}`);
}

// ========================================
// UI: INJECT COLLECTIONS TAB
// ========================================
async function injectShowsCollectionsTab() {
  const slider = document.querySelector('.headerTabs .emby-tabs-slider'); 
  
  if (!slider || document.querySelector('#jfcShowsCollectionsTab')) return;
  const isSeriesPage = await isSeriePage(true);
  if (!isSeriesPage) return;

  const showsTab = slider.querySelector('.emby-tab-button[data-index="0"]');
  const suggestionsTab = slider.querySelector('.emby-tab-button[data-index="1"]');
  if (!showsTab || !suggestionsTab) return;

  const collectionsTab = suggestionsTab.cloneNode(true);
  collectionsTab.id = "jfcShowsCollectionsTab";
  collectionsTab.dataset.index = "0";
  collectionsTab.querySelector('.emby-button-foreground').textContent = "Collections";

  collectionsTab.addEventListener("click", async (e) => {
    // 👇 Check if we're NOT on Shows tab content
    const showsContent = document.querySelector('#tvRecommendedPage #seriesTab.is-active');
    
    if (!showsContent) {
      // Programmatically click Shows tab first to switch content
      e.preventDefault();
      showsTab.click();
      
      // Wait for content to switch, then apply filter
      setTimeout(async () => {
        document.querySelectorAll('.headerTabs .emby-tab-button')
          .forEach(t => t.classList.remove("emby-tab-button-active"));
        
        collectionsTab.classList.add("emby-tab-button-active");
        
        JFC_SHOWS.currentMode = "collections";
        await buildSeriesCollectionsIndex();
        applySeriesFilter(true);
      }, 100);
      
      return;
    }

    // Already on Shows content, just apply filter
    document.querySelectorAll('.headerTabs .emby-tab-button')
      .forEach(t => t.classList.remove("emby-tab-button-active"));

    collectionsTab.classList.add("emby-tab-button-active");

    JFC_SHOWS.currentMode = "collections";
    await buildSeriesCollectionsIndex();
    applySeriesFilter();
  });

  suggestionsTab.after(collectionsTab);
  if (localStorage.getItem(CONFIG.storageKey) === "true") {
    JFC_SHOWS.currentMode = "no-collections"
  }
  consoleLog("✓ Shows 'Collections' tab injected");
}



// ========================================
// UI: ATTACH "SHOWS" TAB RESET LISTENER
// ========================================

function attachShowsTabResetListener() {
  const showsTab = document.querySelector('.headerTabs .emby-tab-button[data-index="0"]');
  const collectionsTab = document.querySelector('#jfcShowsCollectionsTab');
  
  if (!showsTab || showsTab.dataset.jfcAttached) return;

  showsTab.dataset.jfcAttached = "true";

  showsTab.addEventListener("click", () => {
    // Only reset if Collections was active
    if (collectionsTab && collectionsTab.classList.contains("emby-tab-button-active")) {
      collectionsTab.classList.remove("emby-tab-button-active");
    }
    
    // Reset to show all series
    JFC_SHOWS.currentMode = localStorage.getItem(CONFIG.storageKey) === "true" ? "no-collections" : "all";
    applySeriesFilter();
    consoleLog("🔄 Shows tab clicked → reset to 'all'");
  });
}

function watchForSeriesTabChanges() {
  const tabButtons = document.querySelectorAll('.headerTabs .emby-tab-button');
  
  tabButtons.forEach(tab => {
    // Skip Shows and Collections tabs (already handled)
    if (tab.dataset.index === "0" || tab.id === "jfcShowsCollectionsTab") return;
    if (tab.dataset.jfcResetAttached) return;
    
    tab.dataset.jfcResetAttached = "true";
    
    tab.addEventListener("click", () => {
      // Reset filter when switching to other tabs
      const page = document.querySelector('#tvRecommendedPage');
      if (page) {
        page.dataset.jfcFilterMode = localStorage.getItem(CONFIG.storageKey) === "true" ? "no-collections" : "all";
        JFC_SHOWS.currentMode = page.dataset.jfcFilterMode;
        if (document.querySelector('#tvRecommendedPage #jfcUpcomingSeriesContent')) {          
          injectSeriesUpcomingSubTabs();
        }
        consoleLog("🔄 Switched to different tab → filter reset");
      }
    });
  });
}
// ========================================
// WATCHER: DETECT NEW SERIES CARDS LOADED
// ========================================

let seriesPageObserver = null;
let applyFilterDebounce = null;

function watchSeriesPage() {
  if (!location.hash.startsWith("#/tv?")) return;

  const checkForPage = setInterval(async () => {
    const page = document.querySelector("#tvRecommendedPage");
    const seriesTab = document.querySelector("#seriesTab");
    const grid = seriesTab?.querySelector(".itemsContainer");

    if (!page || !grid) return;

    clearInterval(checkForPage);
    consoleLog("📺 Series page detected");

    JFC_SHOWS.currentMode = localStorage.getItem(CONFIG.storageKey) === "true" ? "no-collections" : "all";

    // 👇 Capture total from actual cards
    captureTotalSeriesCount();

    // Initial index build
    await buildSeriesCollectionsIndex();
    applySeriesFilter();

    // Watch for new cards being added (pagination, scrolling, etc.)
    if (seriesPageObserver) seriesPageObserver.disconnect();

    seriesPageObserver = new MutationObserver(() => {
      // Debounce: wait 200ms after last change
      clearTimeout(applyFilterDebounce);
      applyFilterDebounce = setTimeout(async () => {
        captureTotalSeriesCount(); // 👈 Recapture when cards change
        await buildSeriesCollectionsIndex();
        applySeriesFilter();
      }, 200);
    });

    seriesPageObserver.observe(grid, { childList: true, subtree: true });
    consoleLog("👁 Series page observer active");
  }, 500);

  setTimeout(() => clearInterval(checkForPage), 15000);
}

function captureTotalSeriesCount() {
  // Don't capture from paging element - count actual cards instead
  const cards = document.querySelectorAll('#tvRecommendedPage #seriesTab [data-isfolder="true"][data-id][data-type="Series"]');
  JFC_SHOWS.totalSeriesCount = cards.length;
  consoleLog(`📊 Total series on current page: ${JFC_SHOWS.totalSeriesCount}`);
}

// ========================================
// INITIALIZATION
// ========================================

function initSeriesFeatures() {
  if (!location.hash.startsWith("#/tv?")) return;

  consoleLog("🎬 Initializing Series Collections feature...");

  injectSeriesFilterStyles(); // 👈 Inject CSS first
  // if (USER_CONFIG.features.noCollectionFilter && USER_CONFIG.features.seriesCollectionsTab) {
  // }
  
  if (USER_CONFIG.features.seriesCollectionsTab) {
    injectShowsCollectionsTab();
    attachShowsTabResetListener();
    watchForSeriesTabChanges();
  }
  
  watchSeriesPage();
  
  if (USER_CONFIG.features.upcomingSeries) {
    watchSeriesUpcomingTab();
  }
}


// ========================================
// UPCOMING SERIES FEATURE (TMDB Version)
// ========================================

window.JFC_UPCOMING = {
  cache: null,
  cacheTimestamp: 0,
  isLoading: false,
  currentTabView: "library", // "library" | "trending" | "toprated"
  tmdbApiKey: null, // Will be set by user
  trendingVisible: 30,
  topRatedVisible: 30,
  renderUpcomingNeeded: false
};
let trendingAll = [];
let topRatedSeriesAll = [];

let trendingVisible = 30;
let topRatedVisible = 30;
let missingEpisodesTimer = null;

const COMINGSOON_MAX = USER_CONFIG.data.comingSoonLimit;
const TOPRATED_MAX = USER_CONFIG.data.topRatedLimit;
const TRENDING_MAX = USER_CONFIG.data.trendingLimit;
const TMDB_GENRES = {
  // Series genres
  10759: "Action & Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  10762: "Kids",
  9648: "Mystery",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
  37: "Western",
  
  // Movie-specific genres
  28: "Action",
  12: "Adventure",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War"
};
// Get unique genre names for series (from your original list)
const SERIES_GENRES = [
  "Action & Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Kids",
  "Mystery",
  "News",
  "Reality",
  "Sci-Fi & Fantasy",
  "Soap",
  "Talk",
  "War & Politics",
  "Western"
];

// Get unique genre names for movies
const MOVIES_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "TV Movie",
  "Thriller",
  "War",
  "Western"
];

let defaultsMoviesUpcomingGenres = {
  'Action': true,
  'Adventure': true,
  'Animation': true,
  'Comedy': true,
  'Crime': true,
  'Documentary': true,
  'Drama': true,
  'Family': true,
  'Fantasy': true,
  'History': true,
  'Horror': true,
  'Music': true,
  'Mystery': true,
  'Romance': true,
  'Science Fiction': true,
  'TV Movie': true,
  'Thriller': true,
  'War': true,
  'Western': true
};
let defaultsSeriesUpcomingGenres = {
  'Action & Adventure': true,
  'Animation': true,
  'Comedy': true,
  'Crime': true,
  'Documentary': true,
  'Drama': true,
  'Family': true,
  'Kids': true,
  'Mystery': true,
  'News': true,
  'Reality': true,
  'Sci-Fi & Fantasy': true,
  'Soap': true,
  'Talk': true,
  'War & Politics': true,
  'Western': true  
};


let selectedSeriesUpcomingGenres;
let selectedMoviesUpcomingGenres;

try {
  selectedSeriesUpcomingGenres = JSON.parse(localStorage.getItem(CONFIG.upcomingSeriesGenreFilter));
  selectedMoviesUpcomingGenres = JSON.parse(localStorage.getItem(CONFIG.upcomingMoviesGenreFilter));
  JFC_UPCOMING.cache = JSON.parse(localStorage.getItem(CONFIG.upcomingSeriesCache)); 
} catch {
  selectedSeriesUpcomingGenres = null;
  selectedMoviesUpcomingGenres = null;
}

// Initialize with all checked if no saved state
if (!selectedSeriesUpcomingGenres || typeof selectedSeriesUpcomingGenres !== 'object') {
  selectedSeriesUpcomingGenres = {};
  SERIES_GENRES.forEach(genre => selectedSeriesUpcomingGenres[genre] = true);
}

if (!selectedMoviesUpcomingGenres || typeof selectedMoviesUpcomingGenres !== 'object') {
  selectedMoviesUpcomingGenres = {};
  MOVIES_GENRES.forEach(genre => selectedMoviesUpcomingGenres[genre] = true);
}


function loadCache() {
  try { return JSON.parse(localStorage.getItem(CONFIG.missingSeriesCache)) || {}; }
  catch { return {}; }
}

function saveCache(cache) {
  localStorage.setItem(CONFIG.missingSeriesCache, JSON.stringify(cache));
}

function isMissingSeriesCacheExpired(entry) {
  return !entry?.timestamp || (Date.now() - entry.timestamp > CONFIG.missingSeriesCacheTTL);
}
function getFreshCache() {
  const cache = loadCache();

  const oneExpired = Object.values(cache).some(isMissingSeriesCacheExpired);

  if (oneExpired) {
    localStorage.removeItem(CONFIG.missingSeriesCache);
    return {};
  }

  return cache;
}
async function checkSeasonWithCache(seriesId, seasonId, seasonNumber) {
  const cache = getFreshCache();
  const entry = cache[seriesId];

  const local = await getLocalEpisodeCount(seasonId);

  // If we already know this exact local state
  if (entry?.episodes?.[seasonNumber]?.local === local) {
    const online = entry.episodes[seasonNumber].online;

    consoleLog("📦 cache hit (season)", { local, online });

    return { local, online, fromCache: true, cache };
  }

  // else → force online refresh
  return { local, online: null, fromCache: false, cache };
}
async function checkSeriesWithCache(seriesId) {
  const cache = getFreshCache();
  const entry = cache[seriesId];

  const local = await getLocalSeasonCount(seriesId);

  if (entry?.seasons?.local === local) {
    const online = entry.seasons.online;

    consoleLog("📦 cache hit (series)", { local, online });

    return { local, online, fromCache: true, cache };
  }

  return { local, online: null, fromCache: false, cache };
}
function updateSeasonCache(cache, seriesId, seasonNumber, local, online) {
  cache[seriesId] ??= { seasons: {}, episodes: {} };

  cache[seriesId].episodes[seasonNumber] = { local, online };
  cache[seriesId].timestamp = Date.now();

  saveCache(cache);
}
function updateSeriesCache(cache, seriesId, local, online) {
  cache[seriesId] ??= { seasons: {}, episodes: {} };

  cache[seriesId].seasons = { local, online };
  cache[seriesId].timestamp = Date.now();

  saveCache(cache);
}



// ========================================
// DETECT: Active Card Style
// ========================================

function detectActiveCardStyle(isTV = false) {
  const container = document.querySelector(`${isTV ? '#tvRecommendedPage' : '#moviesPage'} .itemsContainer`);
  if (!container) return 'thumbCard'; // Default fallback
  
  // Check for each card type in order
  if (container.querySelector('.card.bannerCard')) {
    return 'banner';
  } else if (container.querySelector('.listItem')) {
    return 'list';
  } else if (container.querySelector('.card.portraitCard:has(.visualCardBox)')) {
    return 'poster';
  } else if (container.querySelector('.card.portraitCard:has(.cardBox-bottompadded)')) {
    return 'posterCard';
  } else if (container.querySelector('.card.backdropCard:has(.visualCardBox)')) {
    return 'thumb';
  } else if (container.querySelector('.card.backdropCard:has(.cardBox-bottompadded)')) {
    return 'thumbCard';
  }
  
  return 'thumbCard'; // Default
}

function getCardClasses(style) {
  switch(style) {
    case 'banner':
      return {
        card: 'card bannerCard card-hoverable bannerCard-scalable',
        scalable: 'cardScalable',
        padder: 'cardPadder-banner',
        image: 'cardImage',
        footer: 'cardFooter',
        hasVisualBox: false
      };
    case 'list':
      return {
        card: 'listItem',
        isListView: true
      };
    case 'poster':
      return {
        card: 'card portraitCard card-hoverable portraitCard-scalable',
        scalable: 'cardScalable',
        padder: 'cardPadder-portrait',
        image: 'cardImage',
        footer: 'cardFooter',
        hasVisualBox: true
      };
    case 'posterCard':
      return {
        card: 'card portraitCard card-hoverable portraitCard-scalable',
        scalable: 'cardScalable',
        padder: 'cardPadder-portrait',
        image: 'cardImage',
        footer: 'cardFooter',
        hasVisualBox: false
      };
    case 'thumb':
      return {
        card: 'card backdropCard card-hoverable backdropCard-scalable',
        scalable: 'cardScalable',
        padder: 'cardPadder-backdrop',
        image: 'cardImage',
        footer: 'cardFooter',
        hasVisualBox: true
      };
    case 'thumbCard':
    default:
      return {
        card: 'card backdropCard card-hoverable backdropCard-scalable',
        scalable: 'cardScalable',
        padder: 'cardPadder-backdrop',
        image: 'cardImage',
        footer: 'cardFooter',
        hasVisualBox: false
      };
  }
}

// ========================================
// FETCH: Library Series Upcoming Episodes
// ========================================

async function fetchLibraryUpcomingEpisodes() {
  consoleLog("📺 Fetching upcoming episodes for library series...");
  
  const { userId, accessToken } = getCredentials();
// if (!tmdbKey) {
//     console.warn("⚠️ TMDB API key not set. Use setTMDBApiKey() first.");
//     return [];
//   }
  
  try {
    // Step 1: Get all series in library
    const libraryRes = await fetch(
      `/Users/${userId}/Items?IncludeItemTypes=Series&Recursive=true&Fields=ProviderIds`,
      { headers: { "X-Emby-Token": accessToken } }
    );
    
    if (!libraryRes.ok) throw new Error("Failed to fetch library");
    
    const libraryData = await libraryRes.json();
    const mySeries = libraryData.Items || [];
    
    consoleLog(`📚 Found ${mySeries.length} series in library`);
    
    const now = new Date();
    const upcoming = [];
    
    // 🚀 Helper function to process a single series
    const processOneSeries = async (series) => {
      const tmdbId = series.ProviderIds?.Tmdb;
      if (!tmdbId) return null;
      
      const localPosterPath = series.ImageTags?.Primary 
        ? `/Items/${series.Id}/Images/Primary?maxHeight=1000`
        : null;
      
      try {
        // Get series details from TMDB
        const showData = await secureTMDBFetch(`tv/${tmdbId}`, {
      'append_to_response': 'content_ratings'
    });
        
        // CASE 1: Has upcoming episode
        if (showData.next_episode_to_air) {
          const nextEp = showData.next_episode_to_air;
          const airdate = new Date(nextEp.air_date);
          
          if (airdate >= now) {
            return {
              tmdbId: tmdbId,
              seriesId: series.Id,
              itemId: series.Id,  // alias for consistency in rendering section (renderUpcomingEpisodes)
              seriesName: series.Name,
              episodeName: nextEp.name,
              season: nextEp.season_number,
              episode: nextEp.episode_number,
              airdate: nextEp.air_date,
              airdateObj: airdate,
              summary: nextEp.overview,
              image: nextEp.still_path ? 
                `https://image.tmdb.org/t/p/w500${nextEp.still_path}` : 
                (showData.backdrop_path ? `https://image.tmdb.org/t/p/w500${showData.backdrop_path}` : null),
              localPosterPath: localPosterPath,
              runtime: nextEp.runtime || showData.episode_run_time?.[0],
              rating: showData.vote_average,
              inLibrary: true,
              hasUpcoming: true
            };
          }
        }
        
        // CASE 2: No upcoming, check for missing latest
        const lastSeason = (showData.seasons || [])
          .filter(s => s.season_number > 0)
          .sort((a, b) => b.season_number - a.season_number)[0];
        
        if (!lastSeason) return null;
        
        // Fetch just the last season
        const seasonData = await secureTMDBFetch(`tv/${tmdbId}/season/${lastSeason.season_number}`, {});
        
        // Find latest aired episode (reverse for speed)
        const episodes = (seasonData.episodes || []).reverse();
        let latest = null;
        
        for (const ep of episodes) {
          if (ep.air_date && new Date(ep.air_date) <= now) {
            latest = { ...ep, season_number: lastSeason.season_number };
            break;
          }
        }
        
        if (!latest) return null;
        
        // Check ownership
        const alreadyOwned = await userHasEpisode(
          series.Id,
          latest.season_number,
          latest.episode_number,
          accessToken
        );
        
        if (alreadyOwned) return null;
        
        return {
          tmdbId: tmdbId,
          seriesId: series.Id,
          itemId: series.Id,  // alias for consistency in rendering section (renderUpcomingEpisodes)
          seriesName: series.Name,
          episodeName: latest.name,
          season: latest.season_number,
          episode: latest.episode_number,
          airdate: latest.air_date,
          airdateObj: latest.air_date? new Date(latest.air_date) : null,
          summary: latest.overview,
          image: latest.still_path
            ? `https://image.tmdb.org/t/p/w500${latest.still_path}`
            : (showData.backdrop_path
                ? `https://image.tmdb.org/t/p/w500${showData.backdrop_path}`
                : null),
          localPosterPath: localPosterPath,
          runtime: latest.runtime || showData.episode_run_time?.[0],
          rating: showData.vote_average,
          inLibrary: true,
          hasUpcoming: false,
          isMissingLatest: true
        };
        
      } catch (e) {
        console.warn(`⚠️ Failed to process ${series.Name}:`, e);
        return null;
      }
    };
    
    // 🚀 Process in parallel batches (TMDB allows 40 req/10s, so ~4 per second is safe)
    const BATCH_SIZE = 4;
    let processed = 0;
    
    for (let i = 0; i < mySeries.length; i += BATCH_SIZE) {
      const batch = mySeries.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(series => processOneSeries(series))
      );
      
      // Collect non-null results
      batchResults.forEach(result => {
        if (result) upcoming.push(result);
      });
      
      processed += batch.length;
      consoleLog(`⏳ Processed ${processed}/${mySeries.length} series...`);
      
      // Wait 1 second between batches (ensures we stay under 40 req/10s limit)
      if (i + BATCH_SIZE < mySeries.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    consoleLog(`✅ Processed ${processed} series, found ${upcoming.length} upcoming episodes`);
    
    // Sort by airdate
    upcoming.sort((a, b) => a.airdateObj - b.airdateObj);
    
    return upcoming;
    
  } catch (error) {
    console.error("❌ Error fetching library upcoming:", error);
    return [];
  }
}

async function userHasEpisode(seriesId, season, episode, accessToken) {
  const res = await fetch(
    `/Users/${getCredentials().userId}/Items?ParentId=${seriesId}&IncludeItemTypes=Episode&Recursive=true&Filters=IsNotFolder&Fields=IndexNumber,ParentIndexNumber`,
    { headers: { "X-Emby-Token": accessToken } }
  );

  if (!res.ok) return false;

  const data = await res.json();
  const episodes = data.Items || [];

  return episodes.some(ep =>
    ep.ParentIndexNumber === season &&
    ep.IndexNumber === episode
  );
}

function getWeightedRating(show, m = 500, C = 7.0) {
  const v = show.vote_count || 0;
  const R = show.vote_average || 0;
  if (v === 0) return 0;
  return (v / (v + m)) * R + (m / (v + m)) * C;
}


// ========================================
// FETCH: Popular Shows (ALL, not just with upcoming)
// ========================================
async function fetchTrendingSeries(limit = 100) {
  consoleLog("🔥 Fetching trending shows from TMDB...");
// if (!tmdbKey) return [];
  
  try {
    // 1️⃣ Get "trending but good" shows (discover = filters power)
    const pages = [1, 2, 3, 4, 5];

    const today = new Date().toISOString().split("T")[0];
    const minYear = new Date().getFullYear() - 3; // shows that still feel "current"

    const pageResults = await Promise.all(
      pages.map(p =>
        secureTMDBFetch('discover/tv', {
          'language': 'en-US',
          'sort_by': 'popularity.desc',
          'vote_count.gte': '100',
          'vote_average.gte': '7',
          'first_air_date.gte': `${minYear}-01-01`,
          'air_date.lte': today,
          'page': p.toString()
        }).then(d => d.results || [])
      )
    );

    const allPopular = dedupeById(pageResults.flat(), 'id'); // ✅ Dedupe/Deduplication by TMDB id   
    consoleLog(`📊 Found ${allPopular.length} trending & filtered shows (base list)`);

 
    // 2️⃣ Fetch show details in parallel (but not infinite)
    const detailPromises = allPopular.slice(0, 40).map(show =>   // 40 is safe & fast & under TMDB limit
      secureTMDBFetch(`tv/${show.id}`, {
        'append_to_response': 'content_ratings'
      }).catch(() => null)
    );

    const detailedShows = (await Promise.all(detailPromises)).filter(Boolean);

    // 3️⃣ Build trending objects
    let trending = detailedShows.map(showData => {
      const nextEp = showData.next_episode_to_air; consoleLog("showData:", showData);
      

      if (nextEp) {
        return {
          tmdbId: showData.id,
          seriesName: showData.name,
          episodeName: nextEp.name,
          season: nextEp.season_number,
          episode: nextEp.episode_number,
          airdate: nextEp.air_date,
          airdateObj: nextEp.air_date ? new Date(nextEp.air_date) : nextEp.firstAirDate ? new Date(nextEp.firstAirDate) : null,
          summary: nextEp.overview,
          image: nextEp.still_path
            ? `https://image.tmdb.org/t/p/w500${nextEp.still_path}`
            : (showData.backdrop_path ? `https://image.tmdb.org/t/p/w500${showData.backdrop_path}` : null),
          posterImage: showData.poster_path
            ? `https://image.tmdb.org/t/p/w500${showData.poster_path}` : null,
          runtime: nextEp.runtime || showData.episode_run_time?.[0],
          rating: showData.vote_average,
          popularity: showData.popularity,
          network: showData.networks?.[0]?.name,
          status: showData.status,
          genres: showData.genres.map(g => g.name),
          inLibrary: false,
          hasUpcoming: true,
          isTrending: true
        };
      }

      // fallback: no upcoming episode
      const lastEp = showData.last_episode_to_air;

      return {
        tmdbId: showData.id,
        seriesName: showData.name,
        episodeName: lastEp?.name,
        season: lastEp?.season_number,
        episode: lastEp?.episode_number,
        airdate: lastEp.air_date,
        airdateObj: lastEp.air_date ? new Date(lastEp.air_date) : lastEp.firstAirDate ? new Date(lastEp.firstAirDate) : null,
        summary: showData.overview,
        image: showData.backdrop_path
          ? `https://image.tmdb.org/t/p/w500${showData.backdrop_path}` : null,
        posterImage: showData.poster_path
          ? `https://image.tmdb.org/t/p/w500${showData.poster_path}` : null,
        rating: showData.vote_average,
        popularity: showData.popularity,
        network: showData.networks?.[0]?.name,
        status: showData.status,
        genres: showData.genres.map(g => g.name),
        firstAirDate: showData.first_air_date,
        inLibrary: false,
        hasUpcoming: false,
        isTrending: true
      };
    });

    // 4️⃣ Sort + limit
    trending.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)); 
    
    // trending = trending.filter(show =>
    //   show.genres?.some(name => selectedSeriesUpcomingGenres[name])
    // ); 

    // Batch check library (single request)
const tmdbIds = trending.map(s => s.tmdbId);
const libraryMap = await batchCheckLibrary(tmdbIds, 'series');

trending.forEach((show, i) => {
  show.inLibrary = libraryMap.has(String(show.tmdbId));
  if (show.inLibrary) {
    show.itemId = libraryMap.get(String(show.tmdbId)); // For linking
  }
});


    consoleLog(`🔥 Built ${trending.length} trending shows`);

    return trending.slice(0, limit);

  } catch (error) {
    console.error("❌ Error fetching trending shows:", error);
    return [];
  }

}

// ========================================
// FETCH: Top Rated Series (Discovery)
// ========================================

async function fetchTopRatedSeries(limit = 100) {
  consoleLog("📺 Fetching high-impact top rated series (experimental)...");

  const TOPRATED_RULES = {
    minVotes: 500,
    minRating: 7.0,
    maxAgeYears: 30
  };
// if (!tmdbKey) return [];

  try {
    const currentYear = new Date().getFullYear();
    const minYear = currentYear - TOPRATED_RULES.maxAgeYears;

    // Calculate pages needed (TMDB returns 20 per page)
    const pagesNeeded = Math.ceil(limit / 20);
    // TMDB allows max 500 pages, but let's cap at 10 for safety (200 results)
    const pagesToFetch = Math.min(pagesNeeded, 20);
    
    const pages = Array.from({ length: pagesToFetch }, (_, i) => i + 1);

    const allPromises = pages.map(page =>
      secureTMDBFetch('discover/tv', {
        'language': 'en-US',
        'sort_by': 'popularity.desc',
        'vote_count.gte': TOPRATED_RULES.minVotes.toString(),
        'vote_average.gte': TOPRATED_RULES.minRating.toString(),
        'first_air_date.gte': `${minYear}-01-01`,
        'page': page.toString()
      })
    );

    const results = await Promise.all(allPromises);
    const flat = results.flatMap(r => r.results || []);
    const allShows = dedupeById(flat, 'id'); // ✅ Dedupe/Deduplication by TMDB id   
    consoleLog(
      `🎯 TMDB dedupe: ${flat.length} → ${allShows.length}`
    );
    consoleLog("📦 Raw discovered series:", allShows.length);

    const formatted = allShows.map(show => {
      const weightedRating = getWeightedRating(show, TOPRATED_RULES.minVotes, TOPRATED_RULES.minRating);

      return {
        tmdbId: show.id,
        seriesName: show.name,
        summary: show.overview,
        image: show.backdrop_path
          ? `https://image.tmdb.org/t/p/w500${show.backdrop_path}`
          : null,
        posterImage: show.poster_path
          ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
          : null,
        rating: show.vote_average,
        voteCount: show.vote_count,
        popularity: show.popularity,
        firstAirDate: show.first_air_date,
        genres: (show.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean),

        weightedRating,
        impactScore:
          (Math.log10(show.vote_count || 1) * 2) +
          (Math.log10(show.popularity || 1)) +
          (weightedRating * 3),

        inLibrary: false,
        trailerKey: null
      };
    });

    const topRated = formatted
      .filter(s => s.rating > 0 && s.voteCount >= TOPRATED_RULES.minVotes && s.rating >= TOPRATED_RULES.minRating && !s.adult)  // filter out adult content but not used anyway
      .sort((a, b) =>
        (b.weightedRating - a.weightedRating) ||
        (b.impactScore - a.impactScore) ||
        (b.voteCount - a.voteCount)
      )
      .slice(0, limit);

// Batch check library (single request)
const tmdbIds = topRated.map(s => s.tmdbId);
const libraryMap = await batchCheckLibrary(tmdbIds, 'series');

topRated.forEach((show, i) => {
  show.topIndex = i + 1;
  show.isTopRated = true;
  show.inLibrary = libraryMap.has(String(show.tmdbId));
  if (show.inLibrary) {
    show.itemId = libraryMap.get(String(show.tmdbId)); // For linking
  }
});

      topRated.forEach((show, i) => {
        show.topIndex = i + 1;        // 1..100
        show.isTopRated = true;
      });


    consoleLog(`✅ Returning ${topRated.length} high-impact series`);

    return topRated;

  } catch (error) {
    console.error("❌ Error fetching top rated series:", error);
    return [];
  }
}

// ========================================
// UPDATE: fetchAllUpcomingSeries to include top rated
// ========================================

async function fetchAllUpcomingSeries(forceRefresh = false) {
  consoleLog("checking cache", forceRefresh, JFC_UPCOMING.cache, Date.now() - JFC_UPCOMING.cache?.cacheTimestamp, CONFIG.upcomingSeriesCacheDuration);
  
  // Check cache
  if (!forceRefresh && JFC_UPCOMING.cache && 
      (Date.now() - JFC_UPCOMING.cache.cacheTimestamp) < CONFIG.upcomingSeriesCacheDuration) {
    consoleLog("📦 Using cached upcoming data");
    return JFC_UPCOMING.cache;
  }
  
  if (JFC_UPCOMING.isLoading) {
    consoleLog("⏳ Already loading...");
    return JFC_UPCOMING.cache || { library: [], trending: [], topRated: [] };
  }
  
  // Display message "no api key found"
  if (!hasTMDB) {
    showApiKeyWarning(document.querySelector('#jfcUpcomingSeriesContent'), 'series');
    return { library: [], trendingAll: [], topRatedSeriesAll: [] };
  }

  JFC_UPCOMING.isLoading = true;
  showSpinner();
  
  try {
    // Fetch all three in parallel
    const [library, trendingAll, topRatedSeriesAll] = await Promise.all([
      fetchLibraryUpcomingEpisodes(),
      fetchTrendingSeries(TRENDING_MAX), 
      fetchTopRatedSeries(TOPRATED_MAX) // Get 30 top rated shows
    ]);
    
    const result = { library, trendingAll, topRatedSeriesAll };

    // Cache the result
    JFC_UPCOMING.cache = result;
    JFC_UPCOMING.cache.cacheTimestamp = Date.now();
    localStorage.setItem(CONFIG.upcomingSeriesCache, JSON.stringify(JFC_UPCOMING.cache));
    
    consoleLog(`💾 Cached ${library.length} library + ${trendingAll.length} trending + ${topRatedSeriesAll.length} top rated`);
    
    return result;
    
  } finally {
    JFC_UPCOMING.isLoading = false;
    showSpinner(false);
  }
}
//const upcomingContainer = document.getElementById("jfcUpcomingSeriesContent");

function renderTrending(container) {
  const filtered = applyUpcomingGenreFilter(trendingAll, 'series');
  const max = Math.min(TRENDING_MAX, filtered.length);
  const visible = filtered.slice(0, Math.min(trendingVisible, max));

  renderUpcomingEpisodes(visible, container);
  renderLoadMoreButton(container, "trending", visible.length, filtered.length);
}

function renderTopRated(container) {
  const filtered = applyUpcomingGenreFilter(topRatedSeriesAll, 'series');
  const max = Math.min(TOPRATED_MAX, filtered.length);
  const visible = filtered.slice(0, Math.min(topRatedVisible, max));

  renderUpcomingEpisodes(visible, container);
  renderLoadMoreButton(container, "toprated", visible.length, filtered.length);
}

function applyUpcomingGenreFilter(list, type = 'series') { consoleLog("applyUpcomingGenreFilter", selectedSeriesUpcomingGenres, list);
  const selectedGenres = type === 'movies' ? selectedMoviesUpcomingGenres : selectedSeriesUpcomingGenres;
  
  if (!selectedGenres) return list;

  const hasActiveFilter = Object.values(selectedGenres).some(v => v === true);

  // If none checked → show everything
  if (!hasActiveFilter) return list;

  return list.filter(item => {
    if (!item.genres || !item.genres.length) return true; // keep unknown

    return item.genres.some(name => selectedGenres[name]);
  });
}





function renderLoadMoreButton(container, type, visible, total) {
  const max = type === "trending" ? TRENDING_MAX : TOPRATED_MAX;

  const limit = Math.min(max, total);

  if (visible >= limit) return;

  const btnContainer = document.createElement("DIV");
  btnContainer.classList.add("mainDetailButtons");
  const btn = document.createElement("button");
  btn.className = "loadMoreBtn emby-button raised";
  btn.textContent = `Load more (${limit - visible})`;

  btn.onclick = () => {
    if (type === "trending") {
      trendingVisible = limit;
      renderTrending(container);
    } else if (type === "toprated") {
      topRatedVisible = limit;
      renderTopRated(container);
    }
  };

  btnContainer.appendChild(btn);
  container?.appendChild(btnContainer);
}






// ========================================
// UI: RENDER UPCOMING EPISODES (with card style detection)
// ========================================
function renderUpcomingEpisodes(episodes, container) { consoleLog("renderUpcomingEpisodes", container); 
  if (!hasTMDB) return;

  showSeriesUpcomingSubtabs();

  if (!episodes || episodes.length === 0) {
    container.innerHTML = `
      <div style="padding: 2em; text-align: center; color: #999;">
        <p>No episodes found.</p>
      </div>
    `;
    // Only auto-switch on initial load
    if (JFC_UPCOMING.currentTabView === "library" && !JFC_UPCOMING.initialLibraryCheckDone) {
      JFC_UPCOMING.initialLibraryCheckDone = true;

      setTimeout(() => {  
        // Trigger the trending tab programmatically
        document.querySelector('#upcomingTab #jfcUpcomingSubTabs button[data-view="trending"]')?.click();
      }, 1000);
    }
    return;
  }
  
  // Detect active card style
  const cardStyle = detectActiveCardStyle(true);
  const classes = getCardClasses(cardStyle);
  const isListView = !!classes.isListView;

  
  consoleLog(`🎨 Using card style: ${cardStyle}`, isListView);
  

  // Handle List View separately
  if (isListView) {
    const listItems = episodes.map(ep => {
      const imageUrl = ep.localPosterPath || ep.posterImage || ep.image || '';
      const tmdbLink = `https://www.themoviedb.org/tv/${ep.tmdbId || ''}`;

      return `
        <div class="listItem listItem-border" data-action="${ep.inLibrary ? 'link' : 'none'}" 
            ${ep.inLibrary ? `data-id="${ep.itemId}"` : ''}>

          <a href="${ep.inLibrary && ep.itemId ? `/web/index.html#!/details?id=${ep.itemId}` : tmdbLink}" 
            ${!ep.inLibrary ? 'target="_blank" rel="noopener"' : ''}
            class="listItemImage itemAction lazy"
            style="background-image: url('${imageUrl}'); cursor: pointer;">
            ${ep.hasUpcoming && ep.season && ep.episode ? `
              <div class="indicators listItemIndicators">
                <div class="countIndicator indicator">S${ep.season}E${ep.episode}</div>
              </div>
            ` : ''}
          </a>

          <div class="listItemBody">
            <a href="${ep.inLibrary && ep.itemId ? `/web/index.html#!/details?id=${ep.itemId}` : tmdbLink}" 
              ${!ep.inLibrary ? 'target="_blank" rel="noopener"' : ''}
              style="cursor: pointer; display: block; text-decoration: none; color: inherit;">
              <div class="listItemBodyText"><bdi>${ep.seriesName}</bdi></div>
              ${ep.episodeName ? `<div class="secondary listItemBodyText">${ep.episodeName}</div>` : ''}
            </a>
          </div>

          <div class="secondary listItemMediaInfo">
            ${ep.rating ? `
              <div class="starRatingContainer mediaInfoItem">
                <span class="material-icons starIcon star" aria-hidden="true"></span>${ep.rating.toFixed(1)}
              </div>
            ` : ''}
          </div>

        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="itemsContainer vertical-list">${listItems}</div>`;
    return;
  }

  
  // Handle Card View
  const cards = episodes.map(ep => {
    const isTopRated = ep.isTopRated;
    const isTrending = ep.isTrending;
    const hasUpcoming = ep.hasUpcoming;

    let timeInfo = '';
    if (typeof ep.airdateObj === 'string') { // back to string when retrived from localStorage cache
      ep.airdateObj = new Date(ep.airdateObj);      
    }
    if (hasUpcoming && ep.airdateObj) {
      const daysUntil = Math.ceil((ep.airdateObj - new Date()) / (1000 * 60 * 60 * 24));
      timeInfo = daysUntil === 0 ? "Today" : 
                 daysUntil === 1 ? "Tomorrow" : 
                 `In ${daysUntil} days`; 
                 
    } else if ((isTopRated || isTrending) && ep.firstAirDate) {
      const year = new Date(ep.firstAirDate).getFullYear();
      timeInfo = `First aired: ${year}`;
    } else if (ep.status) {
      timeInfo = ep.status === "Ended" ? "Series Ended" : 
                 ep.status === "Returning Series" ? "No date announced" :
                 ep.status;
    }
    if (ep.isMissingLatest) {
      timeInfo = "New episode available";
    }

    
    const cardLink = ep.inLibrary  && ep.itemId ? 
      `href="/web/index.html#!/details?id=${ep.itemId}"` : 
      `href="https://www.themoviedb.org/tv/${ep.tmdbId || ep.seriesName}" target="_blank" rel="noopener"`;
    
    const ratingBadge = ep.rating ? `
      <div style="position: absolute; top: 0.5em; left: 0.5em; background: rgba(0,0,0,0.8); padding: 0.3em 0.6em; border-radius: 3px; font-size: 0.85em; z-index: 2;">
        <span class="material-icons" style="font-size: 1em; vertical-align: middle; color: #ffc107;">star</span>
        <span style="vertical-align: middle; margin-left: 0.2em;">${ep.rating.toFixed(1)}</span>
      </div>
    ` : '';
    
    const indexBadge = ep.topIndex ? `
      <div style="
        position: absolute;
        top: 0.5em;
        right: 0.5em;
        background: linear-gradient(135deg, #c9a227, #ffeb7a);
        color: #000;
        padding: 0.3em 0.6em;
        border-radius: 4px;
        font-size: 0.85em;
        font-weight: 700;
        z-index: 2;
        box-shadow: 0 0 6px rgba(0,0,0,0.6);
      ">
        #${ep.topIndex}
      </div>
    ` : '';



    const libraryBadge = ep.inLibrary ? `
      <div style="position: absolute; ${indexBadge ? 'bottom' : 'top'}: 0.5em; right: 0.5em; background: rgba(0,0,0,0.8); padding: 0.3em 0.6em; border-radius: 4px; font-size: 0.85em; z-index: 2;">
        <span class="material-icons" style="font-size: 1em; vertical-align: middle; color: #52c41a;">check_circle</span>
        <span style="vertical-align: middle; margin-left: 0.2em;">In Library</span>
      </div>
    ` : '';
    consoleLog("cardStyle...", cardStyle, ep.posterImage , ep.image, ep);
    
    // Choose image based on card style
    const imageUrl = (cardStyle === 'poster' || cardStyle === 'posterCard') ?
      (ep.localPosterPath || ep.posterImage || ep.image) : ep.image;
    
    const boxClass = classes.hasVisualBox ? 'visualCardBox' : 'cardBox cardBox-bottompadded';
    const daysUntil = Math.ceil((ep.airdateObj - new Date()) / (1000 * 60 * 60 * 24));
    const timeUntil = daysUntil === 0 ? "Today" : 
                      daysUntil === 1 ? "Tomorrow" : 
                      !daysUntil ? "?" :
                      `In ${daysUntil} days`;
      
    const tmdbLink = `https://www.themoviedb.org/tv/${ep.tmdbId || ''}`;
    
    return `
      <div class="${classes.card}" style="min-width: 15em;">
        <div class="${boxClass}">
          <div class="${classes.scalable}">
            <div class="${classes.padder}"></div>

            <a href="${ep.inLibrary && ep.itemId ? `/web/index.html#!/details?id=${ep.itemId}` : tmdbLink}"
              ${!ep.inLibrary ? 'target="_blank" rel="noopener"' : ''}
              class="cardImageContainer coveredImage"
              style="position:absolute; inset:0;">

              <div class="${classes.image}"
                  style="
                    background-image:url('${imageUrl}');
                    background-size:cover;
                    background-position:center;
                    width:100%;
                    height:100%;
                  ">
              </div>

              <div class="cardOverlayContainer itemAction">
                ${!ep.inLibrary ? `
                  <button is="paper-icon-button-light"
                          class="cardOverlayButton cardOverlayButton-hover itemAction paper-icon-button-light cardOverlayFab-primary"
                          onclick="
                            event.stopPropagation(); 
                            event.preventDefault(); 
                            playSerieTrailer(
                              '${ep.tmdbId}', 
                              '${(String(ep.seriesName || ep.name || "")).replace(/'/g, "\\'")}', 
                              ${ep.season || 'null'} // last season for Popular
                            );
                          "
                          title="Play Trailer">
                    <span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover play_arrow"></span>
                  </button>
                ` : ''}
                ${ratingBadge}
                ${indexBadge}
                ${libraryBadge}
              </div>

            </a>
          </div>

          <div class="${classes.footer}">
            <a href="https://www.themoviedb.org/tv/${ep.tmdbId}"
              target="_blank"
              rel="noopener"
              class="jfcOnlineBadge"
              title="Open on TMDB" style="color: inherit; text-decoration: none;">
              <div class="cardText cardTextCentered">${ep.seriesName || ep.name}</div>
              ${ep.season && ep.episode ? `
                <div class="cardText cardText-secondary cardTextCentered">
                  S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')} - ${ep.episodeName || 'TBA'}
                </div>
                <div class="cardText cardText-secondary cardTextCentered" style="display: flex; align-items: center; justify-content: center; gap: 0.5em;">
                  <span style="color: #52c41a;">${timeUntil} ${ep.airtime ? `at ${ep.airtime}` : ''}</span>
                  <div class="itemExternalLinks focuscontainer-x" style="margin:.7em 0;font-size:92%">
                    <a is="emby-linkbutton" class="button-link emby-button" 
                      href="https://www.themoviedb.org/${ep.isTopRated || ep.isTrending || ep.episode ? 'tv' : 'movie'}/${ep.tmdbId}" 
                      target="_blank"
                      title="Open on TMDB" 
                      onclick="event.stopPropagation();"
                      style="padding: 0.2em 0.5em; font-size: 0.8em; min-height: unset;">
                      TMDB
                    </a>
                  </div>
                </div>
              ` : `
                <div class="cardText cardText-secondary cardTextCentered" style="display: flex; align-items: center; justify-content: center; gap: 0.5em;">
                  <span style="color:#999;">${ep.firstAirDate ? `${new Date(ep.firstAirDate).getFullYear()}` : ep.status || ''}</span>
                  <div class="itemExternalLinks focuscontainer-x" style="margin:.7em 0;font-size:92%">
                    <a is="emby-linkbutton" class="button-link emby-button" 
                      href="https://www.themoviedb.org/${ep.isTopRated || ep.isTrending || ep.episode ? 'tv' : 'movie'}/${ep.tmdbId}" 
                      target="_blank"
                      title="Open on TMDB" 
                      onclick="event.stopPropagation();"
                      style="padding: 0.2em 0.5em; font-size: 0.8em; min-height: unset;">
                      TMDB
                    </a>
                  </div>
                </div>
              `}
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');
  consoleLog("render card");
  
  container.innerHTML = `
    <div class="itemsContainer vertical-wrap focuscontainer-x" style="display: flex; flex-wrap: wrap; gap: 1em;">
      ${cards}
    </div>
  `;
}



// ========================================
// UPDATE: injectSeriesUpcomingSubTabs - Add Top Rated Tab
// ========================================

function injectSeriesUpcomingSubTabs() { consoleLog("jfcUpcomingSubTabs:", JFC_UPCOMING.currentTabView);
  const upcomingTab = document.querySelector('#upcomingTab');
  if (!upcomingTab) return;
  
  if (upcomingTab.querySelector('#jfcUpcomingSubTabs')) { 
  
    upcomingTab.querySelector(`#jfcUpcomingSubTabs [data-view="${JFC_UPCOMING.currentTabView}"]`).classList.add('emby-tab-button-active');
    return;
  }
  upcomingTab.classList.add('itemsContainer','padded-left','padded-right','vertical-wrap', 'centered');
  upcomingTab.style.display = 'grid';
  
  const subTabsHtml = `
    <div id="jfcUpcomingSubTabs" class="headerTabs sectionTabs hide" style="margin-top: 1em; margin-bottom: 1.5em;">
      <div class="emby-tabs-slider flex">
        <button class="emby-tab-button emby-button emby-tab-button-active" data-view="library">
          <div class="emby-button-foreground">My Series</div>
        </button>
        <button class="emby-tab-button emby-button" data-view="trending">
          <div class="emby-button-foreground">Trending</div>
        </button>
        <button class="emby-tab-button emby-button" data-view="toprated">
          <div class="emby-button-foreground">Top Rated</div>
        </button>
        <div class="btnFilter-wrapper btnFilterWithIndicator">
          <div class="filterIndicator hide">!</div> 
          <button class="btnFilter autoSize paper-icon-button-light" title="Filter" is="paper-icon-button-light"><span class="material-icons filter_alt" aria-hidden="true"></span></button> 
        </div>
      </div>
    </div>
    <div id="jfcUpcomingSeriesContent" style="margin-top: 1em;">
      <div style="text-align: center; padding: 2em;">
        <div class="mdlSpinner mdlSpinnerActive" style="width: 48px; height: 48px; margin: 0 auto;"></div>
        <p style="margin-top: 1em;">Loading...</p>
      </div>
    </div>
  `;
  
  showSeriesUpcomingSubtabs(subTabsHtml);
  
  const libraryBtn = upcomingTab.querySelector('[data-view="library"]');
  const trendingBtn = upcomingTab.querySelector('[data-view="trending"]');
  const topRatedBtn = upcomingTab.querySelector('[data-view="toprated"]');
  const content = upcomingTab.querySelector('#jfcUpcomingSeriesContent');
  
  const switchTab = (btn, view) => {
    [libraryBtn, trendingBtn, topRatedBtn].forEach(b => 
      b.classList.remove('emby-tab-button-active')
    );
    btn.classList.add('emby-tab-button-active');
    JFC_UPCOMING.currentTabView = view;
  };
  
  libraryBtn.addEventListener('click', async () => {
    switchTab(libraryBtn, "library");
    const data = await fetchAllUpcomingSeries(); 
    renderUpcomingEpisodes(data.library, content);
    loadDiscovery(data);
  });
  
  trendingBtn.addEventListener('click', async () => {
    switchTab(trendingBtn, "trending");
    const data = await fetchAllUpcomingSeries(); 
    loadDiscovery(data, content);
  });

  topRatedBtn.addEventListener('click', async () => {
    switchTab(topRatedBtn, "toprated");
    const data = await fetchAllUpcomingSeries(); 
    loadDiscovery(data, content);
  });
  
  consoleLog("✓ Upcoming sub-tabs injected (3 tabs)");
}

function showSeriesUpcomingSubtabs(subTabsHtml) {
  const upcomingTab = document.querySelector('#upcomingTab');
  if (subTabsHtml) {    
    if (!upcomingTab || upcomingTab?.querySelector('#jfcUpcomingSubTabs')) return;
    upcomingTab.innerHTML = subTabsHtml;
    upcomingTab.querySelector('#jfcUpcomingSubTabs .btnFilter').addEventListener('click', () => {
      openUpcomingFilterDialog('series'); // ← Pass 'series'
    });
  }
  else{
    upcomingTab?.querySelector('#jfcUpcomingSubTabs')?.classList.remove('hide');
  }
  updateUpcomingFilterIndicator('series'); // ← Pass 'series'
}
function loadDiscovery(data, container) {
  trendingAll = data.trendingAll;
  topRatedSeriesAll = data.topRatedSeriesAll;

  // only initialize if first load
  if (!trendingVisible) trendingVisible = 30;
  if (!topRatedVisible) topRatedVisible = 30;
  JFC_UPCOMING.trendingVisible = trendingVisible;
  JFC_UPCOMING.topRatedVisible = topRatedVisible;


  if (JFC_UPCOMING.currentTabView === "trending") {
    trendingVisible = JFC_UPCOMING.trendingVisible || 30;
    renderTrending(container);
  } else if (JFC_UPCOMING.currentTabView === "toprated") {
    renderTopRated(container);
  }
}

// ========================================
// OPEN FILTER DIALOG (DYNAMIC)
// ========================================
function openUpcomingFilterDialog(type = 'series') {
  // Determine context
  const isMovies = type === 'movies';
  const genresList = isMovies ? MOVIES_GENRES : SERIES_GENRES;
  const selectedGenres = isMovies ? selectedMoviesUpcomingGenres : selectedSeriesUpcomingGenres;  
  
  // Generate checkboxes dynamically
  const checkboxesHtml = genresList.map(genre => `
    <label class="videoStandard emby-checkbox-label">
      <input type="checkbox" is="emby-checkbox" class="chkUpcomingGenre emby-checkbox" data-genre="${genre}">
      <span class="checkboxLabel">${genre}</span>
    </label>
  `).join('');

  // Create backdrop
  let backdrop = document.querySelector('.dialogBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'dialogBackdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.classList.add('dialogBackdropOpened');

  // Create dialog container
  let container = document.querySelector('.dialogContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'dialogContainer';
    document.body.appendChild(container);
  }

  // Build dialog HTML
  container.innerHTML = `
    <div data-autofocus="true" class="focuscontainer dialog smoothScrollY ui-body-a background-theme-a formDialog filterDialog centeredDialog opened" style="overflow: auto;max-height: 99vh;">
      <div style="margin:0;padding:1.5em 2em" class="filterDialogContent">
        <div is="emby-collapse" title="Filters" class="emby-collapse">
          <button class="emby-collapsible-button" is="emby-button" type="button" 
          style="animation: 180ms ease-out both scaleup;border-radius: 0 !important;box-sizing: border-box;align-items: center;background: transparent;box-shadow: none;display: flex;
          margin: 0;padding-left: .1em;text-transform: none;width: 100%;backdrop-filter: none;border: none;border-bottom: 0.1rem solid hsla(0,0%,100%,.135);align-items: start;padding: 0 0 1rem 0;">
            <h3 class="emby-collapsible-title">Genres</h3>
          </button>

          <div class="collapseContent expanded" style="height: auto;">
            <div class="checkboxList">
              ${checkboxesHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Populate saved checkbox states
  populateUpcomingFilterState(container, selectedGenres);

  // Track if anything changed
  let filterChanged = false;

  // Handle backdrop click to close
  container.onclick = (e) => {
    if (e.target.classList.contains('dialogContainer')) {
      backdrop.remove();
      container.remove(); 
      
      
      // Re-render if changed
      if (filterChanged) {
        if (isMovies) {
          renderCurrentMoviesView();
        } else {
          const content = document.querySelector('#upcomingTab #jfcUpcomingSeriesContent');
          if (JFC_UPCOMING.currentTabView === "trending") {
            renderTrending(content);
          } else if (JFC_UPCOMING.currentTabView === "toprated") {
            renderTopRated(content);
          }
        }
        
        updateUpcomingFilterIndicator(type);
      }
    }
  };

  // Bind checkbox change events
  container.querySelectorAll('input.chkUpcomingGenre').forEach(checkbox => {
    checkbox.onclick = (e) => {
      const genre = e.target.dataset?.genre;
      if (!genre) return;
      
      // Update the selection object
      if (isMovies) {
        selectedMoviesUpcomingGenres[genre] = e.target.checked;
        localStorage.setItem(CONFIG.upcomingMoviesGenreFilter, JSON.stringify(selectedMoviesUpcomingGenres));
      } else {
        selectedSeriesUpcomingGenres[genre] = e.target.checked;
        localStorage.setItem(CONFIG.upcomingSeriesGenreFilter, JSON.stringify(selectedSeriesUpcomingGenres));
      } 
      
      filterChanged = true;
    };
  });
  
  document.body.appendChild(backdrop);
  document.body.appendChild(container);
}

// ========================================
// POPULATE FILTER STATE
// ========================================
function populateUpcomingFilterState(dialogEl, selectedGenres) {
  const checkboxes = dialogEl.querySelectorAll('input.chkUpcomingGenre[data-genre]');
  
  checkboxes.forEach(cb => {
    const genre = cb.dataset.genre;
    const value = selectedGenres[genre];
    cb.checked = value !== false; // default true if missing
  });
}

// ========================================
// UPDATE FILTER INDICATOR
// ========================================
function updateUpcomingFilterIndicator(type = 'series') {
  const selector = type === 'movies' 
    ? '#moviesPage #jfcMoviesUpcomingTabContent .flex .btnFilter-wrapper'
    : '#tvRecommendedPage #upcomingTab .flex .btnFilter-wrapper';
    
  const indicatorContainer = document.querySelector(selector);
  
  
  if (!indicatorContainer) return;

  const selectedGenres = type === 'movies' ? selectedMoviesUpcomingGenres : selectedSeriesUpcomingGenres;
  const values = Object.values(selectedGenres || {});
  
  if (!values.length) return;

  const checkedCount = values.filter(v => v === true).length;

  // Active only if it's a real filter (not 0, not all)
  const isActive = checkedCount > 0 && checkedCount < values.length;

  let indicator = indicatorContainer.querySelector('.filterIndicator');

  if (isActive) {
    if (!indicator) {
      indicatorContainer.insertAdjacentHTML('afterbegin', '<div class="filterIndicator">!</div>');
      indicator = indicatorContainer.querySelector('.filterIndicator');
    } else {
      indicator.classList.remove('hide');
    }
    indicatorContainer.classList.add('btnFilterWithIndicator');
  } else {
    if (indicator) indicator.classList.add('hide');
    indicatorContainer.classList.remove('btnFilterWithIndicator');
  }
}




// ========================================
// WATCH: Upcoming Tab Activation
// ========================================

function watchSeriesUpcomingTab() {
  const observer = new MutationObserver(() => {
    const upcomingTab = document.querySelector('#upcomingTab.is-active');
    
    if (upcomingTab && !upcomingTab.querySelector('#jfcUpcomingSubTabs')) {
      consoleLog("📺 Upcoming tab activated");
      
      // Inject sub-tabs
      injectSeriesUpcomingSubTabs();
      
      // Load initial data (library view)
      fetchAllUpcomingSeries().then(data => {
        const content = upcomingTab.querySelector('#jfcUpcomingSeriesContent'); 
        
        if (content) {
          renderUpcomingEpisodes(data.library, content);
          loadDiscovery(data);
        }
      });
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  
  consoleLog("👁 Upcoming tab watcher active");
}


// ========================================
// PLAY TRAILER in Modal
// ========================================

function pickBestTrailer(videos) {
  const yt = (videos || []).filter(v =>
    v.site === "YouTube" &&
    v.key &&
    !v.key.startsWith("PRIVATE")  // optional: skip keys known to be problematic
  );

  if (!yt.length) return null;

  const score = v => {
    let s = 0;

    if (v.type === "Trailer") s += 100;
    if (v.type === "Teaser")  s += 50;

    if (v.official) s += 20;
    if (v.size) s += v.size / 10; // 1080 > 720

    if (v.published_at) {
      s += new Date(v.published_at).getTime() / 1e13; // newer = slightly higher
    }

    return s;
  };

  return yt.sort((a, b) => score(b) - score(a))[0];
}

async function playSerieTrailer(tmdbId, seriesName, seasonNumber = null) {
  if (!tmdbId) {
    console.warn('⚠️ playSerieTrailer called without tmdbId for', seriesName);
    alert("Trailer not available");
    return;
  }
try {
    // Inside playSerieTrailer
    let data = seasonNumber 
      ? await secureTMDBFetch(`tv/${tmdbId}/season/${seasonNumber}/videos`, {
          'language': 'en-US'
        })
      : await secureTMDBFetch(`tv/${tmdbId}/videos`, {
          'language': 'en-US'
        });

    // If season-specific is empty, fallback to show-wide
    if (seasonNumber && (!data.results || data.results.length === 0)) {
      data = await secureTMDBFetch(`tv/${tmdbId}/videos`, {
        'language': 'en-US'
      });
      consoleLog(`⚠️ No season trailer found for ${seriesName}, using show-wide trailers`, `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/videos`, data);
    }


    consoleLog("playing:", tmdbId, seriesName, seasonNumber, data);
    // Pick the first usable YouTube trailer
    const trailer = pickBestTrailer(data.results);

    if (!trailer) {
      console.warn("⚠️ No TMDB trailer, falling back to YouTube search for:", seriesName);

      const q = encodeURIComponent(
        seasonNumber && seasonNumber > 1
          ? `${seriesName} season ${seasonNumber} official trailer`
          : `${seriesName} official trailer`
      );

      const ytUrl = `https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%3D%3D`;
      window.open(ytUrl, "_blank", "noopener,noreferrer");
      return;
    }



    // Create modal with YouTube embed
    const modal = document.createElement('div');
    modal.className = 'dialogContainer';
    modal.style.cssText = 'position: fixed; top:0; left:0; right:0; bottom:0; z-index:10000; background: rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center;';

    const origin = encodeURIComponent(location.origin);

    modal.innerHTML = `
      <div style="position:relative; width:90%; max-width:1200px; aspect-ratio:16/9;">
        <button onclick="this.closest('.dialogContainer').remove()" 
                style="position:absolute; top:-40px; right:0; background:none; border:none; color:white; font-size:2em; cursor:pointer; z-index:1;">
          ✕
        </button>
        <iframe
          id="player"
          width="100%"
          height="100%"
          frameborder="0"
          allowfullscreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&playsinline=1&modestbranding=1&rel=0&origin=${origin}">
        </iframe>
            <div style="margin-top:8px; text-align:center; color:#fff; font-size:0.9em;">
      If video cannot play, <a href="https://www.youtube.com/watch?v=${trailer.key}" target="_blank" style="color:#52c41a;opacity:0.7;">watch on YouTube</a>
    </div>
      </div>
    `;

    const iframe = modal.querySelector('iframe');
    iframe.onerror = () => {
      alert(`Video cannot be played in the app. Watch it on YouTube: https://www.youtube.com/watch?v=${trailer.key}`);
    };


    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);

  } catch (err) {
    console.error('❌ playSerieTrailer error for', seriesName, err);
    alert("Failed to load trailer for " + seriesName);
  }
}

// Expose globally
window.playSerieTrailer = playSerieTrailer;



function normalizeTitle(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findTMDbIdByName(seriesName) {
  const clean = normalizeTitle(seriesName); 
  

  const data = await secureTMDBFetch('search/tv', {
      'query': seriesName
    });
  if (!data.results || !data.results.length) return null;

  const badWords = ["motion", "comic", "special", "ova", "chibi", "short", "web"];

  const scored = data.results.map(show => {
    const name = normalizeTitle(show.name || "");
    const original = normalizeTitle(show.original_name || "");

    let score = 0;

    if (name === clean || original === clean) score += 100;
    if (name.includes(clean) || original.includes(clean)) score += 40;
    if (clean.includes(name)) score += 30;

    if (show.number_of_seasons) score += show.number_of_seasons * 2;
    if (show.vote_count) score += Math.min(show.vote_count / 100, 20);

    if (badWords.some(w => name.includes(w) || original.includes(w))) {
      score -= 100;
    }
    consoleLog("findTMDbIdByName", seriesName, name, data.results, show, score);
    return { show, score };
  });

  scored.sort((a, b) => b.score - a.score);

  consoleLog("🔍 TMDb candidates:", scored.slice(0, 5).map(s => ({
    name: s.show.name,
    original: s.show.original_name,
    score: s.score
  })));

  return scored[0].score > 0 ? scored[0].show.id : null;
}

async function findTMDbIdByTvdb(tvdbId) {
  try {
    const data = await secureTMDBFetch(`find/${tvdbId}`, {
      'external_source': 'tvdb_id'
    }); consoleLog("findTMDbIdByTvdb:", vdbId, data);
    
    return data.tv_results?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function injectMissingEpisodes() {
  try {
    const detailsGroup = getActiveDetailsGroup();
    if (!detailsGroup) return;

    const pageItemId = getMovieIdFromUrl();
    if (!pageItemId) return;

    const userId = ApiClient._serverInfo.UserId;

    // 1️⃣ Get current page item (Season)
    const item = await getCurrentPageItem(userId, pageItemId);
    if (!item || item.Type !== "Season") {
      consoleLog("Not a season page, skipping missing-episodes check", item);
      if (item && item.Type === "Series") {
        injectMissingSeasons();
      }
      return;
    }

    const seriesId = item.SeriesId;
    const seasonNumber = item.IndexNumber;

    consoleLog("📦 Season context:", item.SeriesName, "Season", seasonNumber);

    // 🧹 0️⃣ Load + expire cache globally
    let cache = getFreshCache();

    // 2️⃣ Get all owned episodes of THIS season from Jellyfin
    const epsRes = await ApiClient.getEpisodes(seriesId, {
      Season: seasonNumber,
      UserId: userId
    });

    const ownedEpisodes = epsRes?.Items || [];
    const localCount = ownedEpisodes.length;

    if (!localCount) {
      consoleLog("No local episodes in this season");
      return;
    }

    const ownedSet = new Set(ownedEpisodes.map(e => e.IndexNumber));
    consoleLog("🎞 Owned episodes:", [...ownedSet]);

    // 3️⃣ Try cache (LOCAL is king)
    const cachedSeason = cache?.[seriesId]?.episodes?.[seasonNumber];

    if (cachedSeason && cachedSeason.local === localCount) {
      consoleLog("♻️ Using cached season result");

      const missing = [];
      for (let i = 1; i <= cachedSeason.online; i++) {
        if (!ownedSet.has(i)) missing.push(i);
      }

      if (!missing.length) {
        consoleLog("✅ No missing episodes (cache)");
        return;
      }

      renderMissingEpisodes(missing, detailsGroup);
      return;
    }

    consoleLog("🌐 Cache miss or local changed, fetching online data…");

    // 4️⃣ Resolve TMDb id
    let tmdbId = item.ProviderIds?.Tmdb;

    if (!tmdbId && item.ProviderIds?.Tvdb) {
      tmdbId = await findTMDbIdByTvdb(item.ProviderIds.Tvdb);
    }

    if (!tmdbId) {
      tmdbId = await findTMDbIdByName(item.SeriesName);
    }

    if (!tmdbId) {
      console.warn("❌ Could not resolve TMDb id for", item.SeriesName);
      return;
    }

    // 5️⃣ Fetch season from TMDb
    const seasonData = await secureTMDBFetch(`tv/${tmdbId}/season/${seasonNumber}`, {});
    const totalEpisodes = seasonData.episodes?.length || 0;

    if (!totalEpisodes) {
      consoleLog("TMDb returned no episode data");
      return;
    }

    // 6️⃣ Update cache
    cache[seriesId] ??= { seasons: {}, episodes: {} };
    cache[seriesId].episodes[seasonNumber] = {
      local: localCount,
      online: totalEpisodes
    };
    cache[seriesId].timestamp = Date.now();
    saveCache(cache);

    // 7️⃣ Compute missing
    const missing = [];
    for (let i = 1; i <= totalEpisodes; i++) {
      if (!ownedSet.has(i)) missing.push(i);
    }

    if (!missing.length) {
      consoleLog("✅ No missing episodes");
      return;
    }

    consoleLog("🚨 Missing episodes:", missing);

    // 8️⃣ Inject UI
    renderMissingEpisodes(missing, detailsGroup);

  } catch (err) {
    console.error("❌ injectMissingEpisodes failed:", err);
  }
}


function renderMissingEpisodes(missing, detailsGroup) {
  if (!detailsGroup.querySelector("#missingEpisodesGroupItem")) {
    const groupItem = document.createElement("div");
    groupItem.id = "missingEpisodesGroupItem";
    groupItem.className = "detailsGroupItem missingEpisodesGroup";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = "Missing Episodes";

    const content = document.createElement("div");
    content.className = "content focuscontainer-x";
    content.innerHTML = ` ${missing.join(", ")}`;

    groupItem.appendChild(label);
    groupItem.appendChild(content);

    // 👇 inject above collections
    detailsGroup.insertBefore(groupItem, detailsGroup.lastChild);
  }
}

async function injectMissingSeasons() {
  try {
    const isSeries = await isSeriePage();
    if (!isSeries) return;

    const detailsGroup = getActiveDetailsGroup();
    if (!detailsGroup) return;

    // avoid double inject
    if (detailsGroup.querySelector("#missingSeasonsGroupItem")) return;

    const item = await getCurrentPageItem(); // Series item
    if (!item || item.Type !== "Series") return;

    const seriesId = item.Id;
    const userId = ApiClient._serverInfo.UserId;

    consoleLog("📚 Series page detected:", item.Name);

    // 🧹 0️⃣ Load + expire cache
    let cache = getFreshCache();

    // 1️⃣ Get owned seasons from Jellyfin
    const seasons = await ApiClient.getItems(userId, {
      parentId: seriesId,
      includeItemTypes: "Season",
      recursive: false
    });

    const ownedSeasons = (seasons.Items || [])
      .map(s => s.IndexNumber)
      .filter(n => typeof n === "number" && n > 0);

    const localCount = ownedSeasons.length;

    consoleLog("Owned seasons:", ownedSeasons);

    if (!localCount) return;

    // 2️⃣ Try cache first (but only if local matches)
    const cachedSeries = cache?.[seriesId]?.seasons;

    if (cachedSeries && cachedSeries.local === localCount) {
      consoleLog("♻️ Using cached missing seasons");

      const missing = [];
      for (let i = 1; i <= cachedSeries.online; i++) {
        if (!ownedSeasons.includes(i)) missing.push(i);
      }

      if (!missing.length) {
        consoleLog("✅ No missing seasons (cache)");
        return;
      }

      renderMissingSeasons(missing, detailsGroup);
      return;
    }

    consoleLog("🌐 Cache miss or local changed, fetching online data…");

    // 3️⃣ Resolve TMDb id
    let tmdbId = item.ProviderIds?.Tmdb;

    if (!tmdbId && item.ProviderIds?.Tvdb) {
      tmdbId = await findTMDbIdByTvdb(item.ProviderIds.Tvdb);
    }

    if (!tmdbId) {
      tmdbId = await findTMDbIdByName(item.Name);
    }

    if (!tmdbId) {
      console.warn("❌ No TMDb id found for series");
      return;
    }

    // 4️⃣ Fetch TMDb show info
    const showData = await secureTMDBFetch(`tv/${tmdbId}`, {});

    const totalSeasons = (showData.seasons || [])
      .map(s => s.season_number)
      .filter(n => n > 0);

    const onlineCount = totalSeasons.length;

    consoleLog("TMDb seasons:", totalSeasons);

    // 5️⃣ Update cache
    cache[seriesId] ??= { seasons: {}, episodes: {} };
    cache[seriesId].seasons = {
      local: localCount,
      online: onlineCount,
      list: totalSeasons
    };
    cache[seriesId].timestamp = Date.now();
    saveCache(cache);

    // 6️⃣ Diff
    const missing = totalSeasons.filter(n => !ownedSeasons.includes(n));

    if (!missing.length) {
      consoleLog("✅ No missing seasons");
      return;
    }

    consoleLog("🚨 Missing seasons:", missing);

    // 7️⃣ Inject UI
    renderMissingSeasons(missing, detailsGroup);

  } catch (e) {
    console.error("❌ injectMissingSeasons failed:", e);
  }
}

function renderMissingSeasons(missing, detailsGroup) {
  if (!missing.length) return;

  const groupItem = document.createElement("div");
  groupItem.id = "missingSeasonsGroupItem";
  groupItem.className = "detailsGroupItem missingSeasonsGroup";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = "Missing seasons";

  const content = document.createElement("div");
  content.className = "content focuscontainer-x";
  content.innerHTML = missing.join(", ");

  groupItem.appendChild(label);
  groupItem.appendChild(content);

  detailsGroup.insertBefore(groupItem, detailsGroup.lastChild);
}



// watch for SPA navigation
window.addEventListener("hashchange", init);
window.addEventListener("jellyfin:navigation", init);

let lastRoute = null;
let maxInitWait = 0;


        // ========================================
        // INITIALIZATION
        // ========================================

        function init(e) { 
        
            // Wait for ApiClient to be ready
          if (!window.ApiClient?._currentUser) {
            consoleLog("⏳ Waiting for ApiClient...");i
            if (maxInitWait < 60) {              
              setTimeout(init, 500);
            }
            maxInitWait++;
            return;
          }

          if(lastRoute == location.hash) {return;}
          lastRoute = location.hash;

          IS_ADMIN = isAdmin();
          consoleLog("👤 User is admin:", IS_ADMIN);

          consoleLog("Jellyfin Collection Filter initialized");

          const { accessToken, userId } = getCredentials(); 
          if (!accessToken || !userId) {
            console.warn("Not authenticated yet. Script will wait for login.");
            return;
          }

          consoleLog("✓ Authenticated");

          // Inject dashboard buttons if on dashboard
          if (window.location.href.includes("dashboard")) {
            injectDashboardButtons();
          }

          if (location.hash.startsWith("#/details?")) {            
            watchDetailsPage();
          }

          // Inject filter UI
          scripts_injection();
          // Movies page
          if (location.hash.startsWith("#/movies?")) {
            let debounceTimer = null;
            const obs = new MutationObserver(() => {
              clearTimeout(debounceTimer);

              debounceTimer = setTimeout(() => {
                if (location.hash.startsWith("#/movies?")) {
                  scripts_injection();
                  

                  // stop watching once initialized
                  setTimeout(() => obs.disconnect(), 1000);
                }
              }, 250); // 👈 debounce delay
            });

            obs.observe(document.querySelector('.headerTabs'), { 
              subtree: true, 
              childList: true 
            });
          }

          // Re-inject when navigating
          let lastUrl = location.href;
          new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
              lastUrl = url;
              setTimeout(() => {
                if (url.includes("dashboard")) {
                  injectDashboardButtons();
                }
                scripts_injection();
              }, 50);
            }

            // Check if filter dialog is opened
            if (document.querySelector(".filterDialogContent")) {
              setTimeout(() => {
                scripts_injection();
 
                // Sync: if custom checkbox should be unchecked, uncheck official tag too
                if (!USER_CONFIG.features.noCollectionFilter && !document.querySelector('.emby-checkbox[data-filter="IsNotCollection"]')) {
                  const jellyCheckboxEl = document.querySelector('.tagFilters .emby-checkbox[data-filter="NotInCollection"]');
                  if (jellyCheckboxEl && jellyCheckboxEl.checked) {                    
                    jellyCheckboxEl.checked = false;
                    jellyCheckboxEl.dispatchEvent(new Event("change", { bubbles: true }));
                    consoleLog("✓ Official NotInCollection tag unchecked to match custom filter");
                  }
                }
              }, 200);
            }
          }).observe(document, { subtree: true, childList: true });

          // Watch for events
          watchCollectionEdits();      // live collection add/remove            
          watchForLibraryScan(() => { consoleLog("watch...");          
            autoTagNewMovies();
          });

          startAutoTagWatcher();

          // Series page
          if (location.hash.startsWith("#/tv?")) {          
            initSeriesFeatures();
            let debounceTimer = null;
            const obs = new MutationObserver(() => {
              clearTimeout(debounceTimer);

              debounceTimer = setTimeout(() => {
                if (location.hash.startsWith("#/tv?")) {
                  initSeriesFeatures();
                  

                  // stop watching once initialized
                  setTimeout(() => obs.disconnect(), 1000);
                }
              }, 250); // 👈 debounce delay
            });

            obs.observe(document.querySelector('.headerTabs'), { 
              subtree: true, 
              childList: true 
            });
          }
          // Also watch for navigation to TV page
          // window.addEventListener("hashchange", () => {
          //   if (location.hash.startsWith("#/tv?")) {
          //     initSeriesFeatures();
          //   }
          // });

          //TEST
          //setTimeout(init, 2000); 
          
        }

        function scripts_injection() { 
        
          if (!noScript) {
            if (USER_CONFIG.features.upcomingMovies) {
              injectMoviesUpcomingTab();
            }
            if (USER_CONFIG.features.noCollectionFilter) {
              injectCustomCheckbox();
              injectResetButton();
              bindFilterEvents();
              applyDefaultFilterIfNeeded();
            }            
            if (USER_CONFIG.features.actorSearchMenu || USER_CONFIG.features.copyTitleMenu) {
              injectActorSearchMenu();
            }
          }
        }

        if (document.readyState === "loading") {        
          document.addEventListener("DOMContentLoaded", init);
        } else { 
          init();
        }
        setTimeout(init, 2000); 


        // on Hard refresh clear cache
        window.addEventListener("keydown", e => {
          if (e.key === "F5" && (e.ctrlKey || e.metaKey)) {
            consoleLog("⌨️ Ctrl+F5 detected, clearing cache...");
            window.jellyfinTheDwarfsHammer?.clearCache?.(); jellyfinTheDwarfsHammer
          }
        });

        function consoleLog(...args) {
          if (!devMode) return;
          console.log(...args);
        }



  // ========================================
  // EXPOSED API
  // ========================================
  window.jellyfinTheDwarfsHammer = {
    config: {
      get: () => JSON.parse(JSON.stringify(USER_CONFIG)),
      getPlugin: async () => await getPluginConfig(),
      update: (section, key, value) => {
        if (USER_CONFIG[section]?.hasOwnProperty(key)) {
          USER_CONFIG[section][key] = value;
          saveUserConfig();
          return true;
        }
        return false;
      },
      reset: () => {
        localStorage.removeItem('jellyfin_tdh_user_config');
        location.reload();
      },
      refresh: async () => await getPluginConfig(true),
      hasTMDB: async () => await hasTMDBConfigured(),
    },
    isEnabled: async (featureName) => await isFeatureEnabled(featureName),
    
    // Original functions
    tagAllMovies: tagAllNonCollectionMovies,
    syncTags: syncCollectionTags,
    autoTagNew: autoTagNewMovies,
    removeTag: removeTagFromAllMovies,
    clearFilters: clearAllFilters,
    clearCache: () => {
      localStorage.removeItem(CONFIG.collectionsCache);
      localStorage.removeItem(CONFIG.seriesCollectionsCache);
      localStorage.removeItem(CONFIG.moviesCollectionsCache);
      localStorage.removeItem(CONFIG.upcomingSeriesCache);            
      consoleLog("✓ All caches cleared");
    },
    clearSeriesCache: clearSeriesCollectionsCache,
    refreshSeriesCollections: refreshSeriesCollections,
    resetFilter: () => {
      localStorage.removeItem(CONFIG.storageKey);
      consoleLog("✓ Filter state reset");
    },
    softRefreshMoviesList: softRefreshMoviesList,
    checkAuth: () => {
      const creds = getCredentials();
      consoleLog("User ID:", creds.userId);
      consoleLog("Has Token:", !!creds.accessToken);
      return creds;
    },
    isAdmin: isUserAdmin,
    getConfig: () => USER_CONFIG,
    updateConfig: (section, key, value) => {
      if (USER_CONFIG[section] && USER_CONFIG[section].hasOwnProperty(key)) {
        USER_CONFIG[section][key] = value;
        saveUserConfig();
        return true;
      }
      return false;
    },
    resetConfig: () => {
      localStorage.removeItem('jellyfin_tdh_user_config');
      location.reload();
    },
    upcomingEpisodes: {
      refresh: () => fetchAllUpcomingSeries(true),
      clearCache: () => {
        JFC_UPCOMING.cache = null;
        JFC_UPCOMING.cacheTimestamp = 0;
        consoleLog("🗑️ Upcoming cache cleared");
      }
    }
  };



  // ========================================
  // INITIALIZATION
  // ========================================
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initializeConfig().then(init);
    });
  } else {
    initializeConfig().then(init);
  }

})();
