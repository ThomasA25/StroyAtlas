# HotD map assets

The StoryAtlas map view needs a **base map image** of Westeros (fictional pixel
coordinate space — no real geo-coordinates). None is bundled here on purpose.

## Why no map is included

Per the dataset task rules, official HBO/Warner maps must **not** be copied
blindly (copyright). A suitable map should be **freely / Creative-Commons or
fan-licensed**, with its source and license recorded below before use.

## How to add one

1. Obtain a freely-licensed Westeros map (e.g. a CC-BY fan map; verify the
   license yourself).
2. Save it here as `westeros-map.<ext>` (e.g. `westeros-map.jpg`).
3. Fill in the attribution block below.
4. In the app's **Map** view, set the image (URL or upload) and its pixel
   width/height, then place locations by clicking/dragging. Location
   `coordinates.x/y` in `../locations.json` are currently `null`.

## Attribution (fill in when a map is added)

```
file:    westeros-map.<ext>
source:  <URL>
author:  <name>
license: <e.g. CC BY 4.0> (<license URL>)
notes:   <any modifications made>
```
