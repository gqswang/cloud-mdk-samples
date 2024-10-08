import GetMeterReadingResults from './GetMeterReadingResults';
import BinaryToBase64 from '../Utils/BinaryToBase64';

const IMAGE_URL_PREFIX = "data:image/jpeg;base64,";
const schema = {
  "type": "object",
  "properties": {
    "anomalyDetected": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Short title of the anomaly."
          },
          "anomalyDescription": {
            "type": "string",
            "description": "Short description of the anomaly."
          },
          "tasks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "taskTitle": {
                  "type": "string",
                  "description": "Short title of the task."
                },
                "shortDescription": {
                  "type": "string",
                  "description": "Short description of the action needed to fix the anomaly."
                },
                "description": {
                  "type": "string",
                  "description": "Clear and concise explanation of the action needed to fix the anomaly. Do not use numbering. Display one paragraph only."
                },
                "priority": {
                  "type": "string",
                  "description": "Indicate the urgency of the task (e.g., high, medium, low)"
                }
              },
              "required": ["taskTitle", "shortDescription", "description", "priority"]
            }
          }
        },
        "required": ["title", "anomalyDescription", "tasks"]
      }
    }
  },
  "required": ["anomalyDetected"]
}

export default async function SendAnomalyDetectionRequest(context) {
  const meterReadingResults = GetMeterReadingResults(context);
  const prompt =
    `Analyze the provided image(s) thoroughly to detect any anomalies or irregularities. 
    Identify areas that deviate from the expected standard or exhibit unusual features. There might not be any anomalies.

    ${meterReadingResults.length ? `The following are the meter readings of the component in JSON - ${JSON.stringify(meterReadingResults, null, 2)}. This meter reading is optional and not necessary required for anomaly detection.` : 'There is no meter reading results'}

    Identify the detected anomaly with its title.
    Create a to-do list (minimum 1, maximum 2) to address and fix each detected anomaly.
    Include the following details for each task:
    - Title: Short title of the task
    - Task Description: Clear and concise explanation of the action needed to fix the anomaly. Include the meter reading if the meter reading results is defined.
    - Priority: Indicate the urgency of the task (e.g., high, medium, low).
    `;

  const method = "POST";
  const body = {
    messages: [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": prompt
          }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 1024,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    functions: [{ name: "format_response", parameters: schema }],
    function_call: { name: "format_response" },
  };
  const headers = {
    "content-type": "application/json",
    "AI-Resource-Group": "default"
  }
  const service = "/MDKDevApp/Services/AzureOpenAI.service";
  const path = "/chat/completions?api-version=2024-02-01";
  const pageProxy = context.getPageProxy();
  const attachments = pageProxy.evaluateTargetPath("#Control:AttachmentAnomalyDetection/#Value");
  if (!attachments || attachments.length === 0) {
    alert("Please attach an image");
    return;
  }

  // Preprocess images
  attachments.forEach((attachment) => {
    let base64String = BinaryToBase64(context, attachment.content);
    const imageData = {
      "type": "image_url",
      "image_url": {
        "url": `${IMAGE_URL_PREFIX}${base64String}`
      }
    }
    body.messages[0].content.push(imageData);
  });

  // Send API request
  console.log("Sending anomaly detection request...");
  return context.executeAction({
    "Name": "/MDKDevApp/Actions/SendRequest.action",
    "Properties": {
      "Target": {
        "Path": path,
        "RequestProperties": {
          "Method": method,
          "Headers": headers,
          "Body": JSON.stringify(body)
        },
        "Service": service
      },
      "ActivityIndicatorText": "Sending anomaly detection request...",
    }
  }).then(async response => {
    const results = JSON.parse(response.data.choices[0].message.function_call.arguments);
    const mainPage = context.evaluateTargetPathForAPI("#Page:MDKGenAIPage");
    const cd = mainPage.getClientData();
    cd.AnomalyResults = results.anomalyDetected;
    console.log("Anomaly results:", results.anomalyDetected);
    console.log("");

    // Get image type for manual input (limitation to only one type of equipment per request)
    const description = JSON.stringify(results.anomalyDetected[0], null, 2);

    console.log("Fetching equipment name...");
    let spinnerID = context.showActivityIndicator('Fetching equipment name...');
    const equipmentName = await getEquipmentName(context, description);
    context.dismissActivityIndicator(spinnerID);
    cd.EquipmentNameResults = equipmentName;
    console.log("Equipment Name:", equipmentName);
    console.log("");
    return true;
  });
}

async function getEquipmentName(context, description) {
  const functionName = 'getRagResponse';
  const serviceName = '/MDKDevApp/Services/CAPVectorEngine.service';
  const parameters = {
    "value": `The descibed equipment type has the following anormaly: ${description}. What is the unique name of the equipment based on the anormaly described, it must only give the unique name of the equipment only without any explaination.`
  };
  let oFunction = { Name: functionName, Parameters: parameters };
  try {
    const response = await context.callFunction(serviceName, oFunction);
    const responseObj = JSON.parse(response);
    return responseObj.completion.content;
  } catch (error) {
    console.log("Error:", error.message);
  }
  return;
}