// import shp from "shpjs";

/**
 * Processes geospatial files and converts them to GeoJSON
 * @param {File} file - The uploaded file
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} GeoJSON object
 */

/**
 * Processes geospatial files and converts them to GeoJSON
 * @param {File} file - The uploaded file
 * @param {Function} onError - Error callback
 * @returns {Promise<Object>} GeoJSON object
 */
export async function processGeospatialFile(file, onError) {
  const name = file.name;
  const ext = name.split(".").pop().toLowerCase();
  try {
    if (ext === "geojson" || ext === "json") {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.type || !data.features) {
        throw new Error("Invalid GeoJSON.");
      }
      return data;
      // } else if (ext === "zip") {
      //   return await shp(file);
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (err) {
    if (onError) onError(err.message);
    throw err;
  }
}
