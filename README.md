# The Dwarf's Hammer 🔨

<p align="center">
  <img src="https://raw.githubusercontent.com/kamoba/jellyfin-plugin-thedwarfshammer/main/Screenshots/Screenshot.png" alt="The Dwarf's Hammer"/>
</p>

**Enhanced collection management and content discovery for Jellyfin, tested on 10.11.5**

![Plugin Version](https://img.shields.io/badge/version-1.0.0.0-blue)
![Jellyfin Version](https://img.shields.io/badge/jellyfin-10.9%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)


## ✨ Features

### 🎬 Upcoming Content
- Upcoming Movies (Coming Soon + Top Rated)
- Upcoming Series :
  - Library: Upcoming episodes + last missing episode
  - Trending
  - Top Rated
- TMDB integration with trailer playback
- Genre filtering
- "In Library" badges

### 📚 Collection Management
- "No Collection" filter for Movies and Series
- Series Collections tab
- Auto-tagging for non-collection content, required for filtering movies only
- Real-time sync option (admin only)

### 🔍 Enhanced UI
- Actor/actress Google search from context menu
- Copy title from context menu
- Missing episodes/seasons detection
- Collection links on detail pages

## 🚀 Installation

### Step 1: Install Plugin

1. **Dashboard → Plugins → Repositories**
2. Click **+ Add**
3. **Name:** `The Dwarf's Hammer`
4. **URL:** `https://raw.githubusercontent.com/kamoba/jellyfin-plugin-thedwarfshammer/main/manifest.json`
5. Save
6. Go to **Plugins catalog** tab
7. Find **The Dwarf's Hammer**
8. Click **Install**
9. **Restart Jellyfin**
10. Refresh browser

### Step 2: Configure Plugin

1. **Dashboard → Plugins → The Dwarf's Hammer**
2. Get free TMDB API key from [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (Optional, needed for Upcomings)
3. Paste API key
4. Click **Save**
5. **Dashboard → Scan All Libraries** (or use "Tag Non-Collection Movies" button on Dashboard)
   - This tags movies not in collections with "NotInCollection" 
   - Tags auto-update on each full library scan
   - ⚠️ **Note:** Quick scans (Libraries → Movies → Scan Library) won't update tags - use full scan from Dashboard

**Tip:** For ongoing updates, enable "Real-time Tagging" in plugin settings to automatically tag new movies as they're added.

### Step 3: Install Client Script

Choose **one** method:

#### Option A: JavaScript Injector Plugin

1. Install [JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) from Plugins
2. Restart Jellyfin
3. Download: [thedwarfshammer.js](https://raw.githubusercontent.com/kamoba/jellyfin-plugin-thedwarfshammer/main/Web/thedwarfshammer.js)
4. **Dashboard → Plugins → JavaScript Injector**
5. Add script, paste contents, enable, save
6. Refresh browser (Ctrl+F5)

#### Option B: Manual Injection


**Docker:**
```bash
wget https://raw.githubusercontent.com/kamoba/jellyfin-plugin-thedwarfshammer/main/Web/thedwarfshammer.js
docker cp thedwarfshammer.js jellyfin:/jellyfin/jellyfin-web/
docker exec jellyfin sed -i 's|</body>|<script src="thedwarfshammer.js"></script></body>|' /jellyfin/jellyfin-web/index.html
docker restart jellyfin
```

**Linux:**
```bash
sudo wget -O /usr/share/jellyfin/web/thedwarfshammer.js https://raw.githubusercontent.com/kamoba/jellyfin-plugin-thedwarfshammer/main/Web/thedwarfshammer.js
sudo sed -i 's|</body>|<script src="thedwarfshammer.js"></script></body>|' /usr/share/jellyfin/web/index.html
sudo systemctl restart jellyfin
```

**Or Edit index.html:**
```
Download script in same location then add `<script src="thedwarfshammer.js"></script>` before `</body>`
```

#### Option C: Install the File Transformation plugin **[TO DO]**

⚠️ Re-apply after Jellyfin updates

✅ **Done!** Refresh browser (Ctrl+F5)


## 🎯 Usage

- **Upcoming Content:** Movies/Shows → "Upcoming" tab
- **Filter Collections:** Filter button → "No collections"
- **Missing Episodes:** Open any series/season → see missing episodes
- **Auto-Tag:** Dashboard → "Tag Non-Collection Movies" button (admin only)

💡 **Tip:** Press **Ctrl+F5** (or Cmd+Shift+R on Mac) to refresh cached data (default 1h) and fetch latest upcoming content from TMDB.

## 🔒 Security

- TMDB API key stored server-side only
- All API calls proxied through plugin
- Role-based access control

## 🐛 Troubleshooting

**Plugin not showing:**
```bash
docker logs jellyfin | grep -i dwarf
```

**Script not loading:**
- Hard refresh (Ctrl+F5)
- Check browser console (F12)

## 📜 License

MIT [License](LICENSE)

## 🙏 Credits

- [Jellyfin](https://jellyfin.org/)
- [TMDB API](https://www.themoviedb.org/)

## 💬 Support

- [GitHub Issues](https://github.com/kamoba/jellyfin-plugin-thedwarfshammer/issues)
- [r/jellyfin](https://reddit.com/r/jellyfin)

---

**Enjoying this plugin?** ⭐ Star the repo!
