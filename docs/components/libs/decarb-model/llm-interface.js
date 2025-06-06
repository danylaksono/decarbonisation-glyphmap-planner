// JSON schema validator, e.g., Ajv
// import Ajv from "ajv";

export async function queryLLMForConfig(naturalLanguageQuery) {
  console.log("Querying LLM with:", naturalLanguageQuery);
  const response = await fetch(
    "https://llm-backend.netlify.app/.netlify/functions/llm-query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: naturalLanguageQuery }),
    }
  );
  console.log("LLM API Response Status:", response.status);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("LLM API Error Body:", errorBody);
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }
  const { config } = await response.json();
  console.log("Received config from LLM (raw):", config);

  // --- Client-side validation (conceptual) ---
  // try {
  //   // 1. Fetch schema (or import it if it's bundled)
  //   const schemaResponse = await fetch("/path/to//model-config-schema.json");
  //   if (!schemaResponse.ok) {
  //     throw new Error("Failed to load model config schema");
  //   }
  //   const modelConfigSchema = await schemaResponse.json();
  //
  //   // 2. Initialize validator and compile schema
  //   const ajv = new Ajv(); // Or  chosen validator
  //   const validate = ajv.compile(modelConfigSchema);
  //
  //   // 3. Validate the received config
  //   if (!validate(config)) {
  //     console.error("LLM config validation failed:", validate.errors);
  //     throw new Error("Received config from LLM failed schema validation.");
  //   }
  //   console.log("LLM config validated successfully against schema.");
  // } catch (validationError) {
  //   console.error("Error during config validation:", validationError);
  //   throw validationError; // Re-throw or handle as appropriate
  // }
  return config;
}
