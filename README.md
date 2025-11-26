# Barcelona Green Accessibility – 3D Urban Analysis

This project analyses walking accessibility to urban green areas in the municipality of Barcelona and visualizes the results through an interactive 3D web viewer. The workflow combines open geospatial data, cadastral information, population statistics, and pedestrian network analysis to derive parcel-level accessibility metrics and shortest walking routes to the nearest relevant green structure.

## 1. Data Sources

### 1.1 Green areas (OSM)
Green areas were extracted from OpenStreetMap using Overpass API. Only polygons representing meaningful public green spaces were selected, based on tags such as:

- leisure=park
- leisure=garden
- landuse=forest
- natural=wood

The extraction boundary was the administrative limit of Barcelona (admin_level 8). Data was reprojected to EPSG:25831 and filtered to parks ≥ 5,000 m². Smaller polygons are only included when merged into aggregated structures.

### 1.2 Aggregated green structures
Nearby green polygons were grouped into “green structures.” Structures are included when total area ≥ 5,000 m².

### 1.3 Parcels (cadastral data)
Parcel geometries and CAT attribute tables were downloaded from the Spanish Cadastre. Attributes include land use, built-up area, and number of residential properties. These were joined to geometries using the cadastral reference.

### 1.4 Population data
Population counts were obtained from INE and census geometries from ICGC. Population per section was redistributed to parcels proportionally to residential built-up area:
parcel_population = (parcel_residential_area / total_residential_area_in_section) * population_section.

### 1.5 Pedestrian network (OSM)
Pedestrian ways were extracted with:
way["highway"]["foot"!~"no"].
Includes footway, path, pedestrian, living_street, steps, etc.

## 2. Accessibility Analysis

### 2.1 Shortest walking routes
For each parcel, the shortest walking route to the nearest green structure was computed. Walking speed: 5 km/h. Output: parcel_id, walk_distance, walk_time.

## 3. 3D Visualization
The viewer displays 3D extruded parcels (height = population), green areas (fills), green structures (dashed outlines), and routes on demand. Parcels colored by walk_time. Datasets in FlatGeobuf and GeoJSON.

## 4. File Structure

/data
  /barcelona
    green_areas_barcelona.geojson
    green_structures_barcelona.geojson
    parcels_barcelona.fgb
    routes_barcelona.fgb
index.html
main.js
styles.css

## 5. License
OSM data © OpenStreetMap contributors (ODbL). Cadastre © Dirección General del Catastro. Population © INE. Census geometries © ICGC.

## 6. Author
Mónica Alegre
LinkedIn: https://www.linkedin.com/in/malegre-gis
Web: https://monica-alegre.me
