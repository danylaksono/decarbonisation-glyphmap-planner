import "dotenv/config";
const apiKey = process.env.OPENAI_API_KEY;

// 1. User provides a natural language query:
const userQuery = "Show rows where age is greater than 30";

// 2. Send the query to OpenAI API to parse it into filter components
async function parseQueryWithOpenAI(query) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "Extract the filter components (attribute, operator, threshold) from the user's query. Respond as JSON: { attribute: string, operator: string, threshold: string|number }",
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 50,
    }),
  });
  const data = await response.json();
  // Example response: { attribute: "age", operator: ">", threshold: 30 }
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed;
}

// 3. Use the parsed filter to create and apply the filter function
async function filterTableFromNaturalLanguage(tableInstance, query) {
  const { attribute, operator, threshold } = await parseQueryWithOpenAI(query);
  const filterFn = createDynamicFilter(attribute, operator, threshold);
  tableInstance.applyCustomFilter(filterFn);
}

// 4. Usage with your sorterTable instance
// filterTableFromNaturalLanguage(mySorterTable, userQuery);

async function parseComplexFilter(query) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Convert the user's query into a JavaScript function body that returns true if a data object matches the filter. The data object is called "row". Only return the function body, not a full function.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 100,
    }),
  });
  const data = await response.json();
  // Example response: 'return row.EPC_rating > "D" && row.ashp_size < 3;'
  return data.choices[0].message.content.trim();
}

async function applyComplexNaturalLanguageFilter(query) {
  const functionBody = await parseComplexFilter(query);
  // eslint-disable-next-line no-new-func
  const filterFn = new Function("row", functionBody);
  return functionBody;
  // tableInstance.applyCustomFilter(filterFn);
}

// "return row.EPC_rating > 'D' && row.ashp_size < 3;"
// applyComplexNaturalLanguageFilter(userQuery)

// // ...existing code...

// export class sorterTable {
//   // ...existing code...

//   getNode() {
//     // ...existing code...

//     // --- Natural Language Query UI ---
//     const nlQueryContainer = document.createElement("div");
//     nlQueryContainer.style.display = "flex";
//     nlQueryContainer.style.alignItems = "center";
//     nlQueryContainer.style.marginBottom = "10px";
//     nlQueryContainer.style.gap = "8px";

//     const nlInput = document.createElement("input");
//     nlInput.type = "text";
//     nlInput.placeholder = "Filter with natural language (e.g. EPC_rating > D and ashp_size < 3)";
//     nlInput.style.flex = "1";
//     nlInput.style.padding = "6px 10px";
//     nlInput.style.fontSize = "1em";
//     nlInput.style.border = "1px solid #ccc";
//     nlInput.style.borderRadius = "4px";

//     const nlButton = document.createElement("button");
//     nlButton.innerText = "Apply";
//     nlButton.style.padding = "6px 16px";
//     nlButton.style.fontSize = "1em";
//     nlButton.style.background = "#2196F3";
//     nlButton.style.color = "#fff";
//     nlButton.style.border = "none";
//     nlButton.style.borderRadius = "4px";
//     nlButton.style.cursor = "pointer";

//     nlButton.addEventListener("click", async () => {
//       const query = nlInput.value.trim();
//       if (!query) return;
//       nlButton.disabled = true;
//       nlButton.innerText = "Filtering...";
//       try {
//         await this.applyNaturalLanguageFilter(query);
//       } catch (e) {
//         alert("Failed to apply filter: " + e.message);
//       }
//       nlButton.disabled = false;
//       nlButton.innerText = "Apply";
//     });

//     nlQueryContainer.appendChild(nlInput);
//     nlQueryContainer.appendChild(nlButton);

//     // Insert the NL query UI at the top of the container
//     const container = document.createElement("div");
//     container.style.width = "100%";
//     container.style.display = "flex";
//     container.style.flexDirection = "column";
//     container.appendChild(nlQueryContainer);

//     // ...existing code for sidebar and table...
//     const mainContent = super.getNode ? super.getNode() : (() => {
//       // fallback to previous getNode code
//       let main = document.createElement("div");
//       main.style.display = "flex";
//       main.style.flexDirection = "row";
//       // ...existing code for sidebar and tableScrollDiv...
//       return main;
//     })();
//     container.appendChild(mainContent);

//     this._containerNode = container;
//     return container;
//   }

//   async applyNaturalLanguageFilter(query) {
//     // This function assumes you have a backend endpoint or proxy that safely calls OpenAI API
//     // and returns a JS function body string for the filter.
//     // For demo, here's a mock implementation:
//     const functionBody = await fetch("/api/nl2filter", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ query })
//     })
//       .then(res => res.json())
//       .then(res => res.functionBody);

//     // eslint-disable-next-line no-new-func
//     const filterFn = new Function("row", functionBody);
//     this.applyCustomFilter(filterFn);
//   }

//   // ...existing code...
// }
// // ...existing code...
