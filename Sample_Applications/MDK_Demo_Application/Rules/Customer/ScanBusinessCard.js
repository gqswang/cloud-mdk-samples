/**
 * Scans a business card image using AI and extracts contact information
 * @param {IClientAPI} context - The MDK client API context
 */
export default async function ScanBusinessCard(context) {
    try {
        // Get the attachment from the form
        const pageProxy = context.getPageProxy();
        const attachments = pageProxy.evaluateTargetPath("#Control:AttachmentBusinessCard/#Value");
        
        if (!attachments || attachments.length === 0) {
            console.log('No attachments found');
            return context.executeAction('/MDKDemoApp/Actions/GenericToastMessage.action');
        }

        console.log(`Processing ${attachments.length} attachment(s)`);

        // Define the prompt for business card extraction
        const prompt = `Analyze the business card image and extract the following information:
- First Name
- Last Name  
- Phone Number
- Email Address
- Complete Address (street, city, state, postal code, country)
- Company Name
- Job Title/Position

Return the information in a structured JSON format. If any field is not visible or unclear, leave it empty.`;

        // Structure the message with text and image
        let messages = [{
            "role": "user",
            "content": [{
                "type": "text",
                "text": prompt
            }]
        }];

        // Define the response schema using function calling
        const schema = {
            "type": "object",
            "properties": {
                "firstName": { 
                    "type": "string", 
                    "description": "First name from business card" 
                },
                "lastName": { 
                    "type": "string", 
                    "description": "Last name from business card" 
                },
                "phone": { 
                    "type": "string", 
                    "description": "Phone number" 
                },
                "email": { 
                    "type": "string", 
                    "description": "Email address" 
                },
                "street": { 
                    "type": "string", 
                    "description": "Street address" 
                },
                "city": { 
                    "type": "string", 
                    "description": "City" 
                },
                "state": { 
                    "type": "string", 
                    "description": "State/Province" 
                },
                "postalCode": { 
                    "type": "string", 
                    "description": "Postal/ZIP code" 
                },
                "country": { 
                    "type": "string", 
                    "description": "Country" 
                },
                "company": { 
                    "type": "string", 
                    "description": "Company name" 
                },
                "jobTitle": { 
                    "type": "string", 
                    "description": "Job title or position" 
                }
            },
            "required": ["firstName", "lastName"]
        };

        const tools = [{
            "type": "function",
            "function": {
                "name": "extract_business_card_info",
                "description": "Extract structured information from a business card image",
                "parameters": schema
            }
        }];

        const toolChoice = {
            "type": "function",
            "function": { "name": "extract_business_card_info" }
        };

        // Convert image to base64
        console.log('Converting image to base64...');
        for (const attachment of attachments) {
            let base64String = await context.binaryToBase64String(attachment.content);
            const imageData = {
                "type": "image_url",
                "image_url": {
                    "url": `data:image/jpeg;base64,${base64String}`
                }
            };
            messages[0].content.push(imageData);
        }

        console.log('Executing AI Core ChatCompletions action...');
        
        // Execute the ChatCompletions action with dynamic properties
        const result = await context.executeAction({
            Name: '/MDKDemoApp/Actions/Customer/ChatCompletions.action',
            Properties: {
                Properties: {
                    Messages: messages,
                    Tools: tools,
                    ToolChoice: toolChoice,
                    Temperature: 0.1,
                    MaxTokens: 512
                },
                ActivityIndicatorText: "Analyzing business card..."
            }
        });
        
        // Log the complete AI response for debugging
        console.log('AI Core Response:', JSON.stringify(result, null, 2));
        
        if (result && result.data) {
            console.log('AI response data:', JSON.stringify(result.data, null, 2));
            
            // Parse the AI response
            const response = result.data;
            
            // Check if we have the expected structure
            if (!response.choices || !response.choices[0]) {
                console.error('Unexpected response structure - no choices array');
                return context.executeAction('/MDKDemoApp/Actions/GenericToastMessage.action');
            }
            
            if (!response.choices[0].message || !response.choices[0].message.tool_calls) {
                console.error('Unexpected response structure - no tool_calls');
                return context.executeAction('/MDKDemoApp/Actions/GenericToastMessage.action');
            }
            
            const toolCall = response.choices[0].message.tool_calls[0];
            console.log('Tool call arguments:', toolCall.function.arguments);
            
            const extractedData = JSON.parse(toolCall.function.arguments);
            console.log('Extracted data:', extractedData);

            // Store extracted data in client data for reference
            context.getClientData().ExtractedBusinessCardData = extractedData;

            // Helper function to safely set control value using evaluateTargetPath
            const setControlValue = (controlName, value) => {
                try {
                    if (value) {
                        const targetPath = `#Control:${controlName}`;
                        console.log(`Setting ${controlName} to: ${value} using path: ${targetPath}`);
                        pageProxy.evaluateTargetPath(targetPath).setValue(value);
                    } else {
                        console.log(`Skipping ${controlName} - no value`);
                    }
                } catch (err) {
                    console.error(`Error setting value for control ${controlName}:`, err);
                }
            };

            // Auto-populate form fields with null checks
            setControlValue('FormCellFirstName', extractedData.firstName);
            setControlValue('FormCellLastName', extractedData.lastName);
            setControlValue('FormCellPhone', extractedData.phone);
            setControlValue('FormCellEmail', extractedData.email);
            setControlValue('FormCellCompany', extractedData.company);
            setControlValue('FormCellJobTitle', extractedData.jobTitle);
            
            // Construct full address from components
            const addressParts = [
                extractedData.street,
                extractedData.city,
                extractedData.state,
                extractedData.postalCode,
                extractedData.country
            ].filter(part => part && part.trim() !== '');
            
            if (addressParts.length > 0) {
                const fullAddress = addressParts.join(', ');
                console.log('Setting address to:', fullAddress);
                setControlValue('FormCellAddress', fullAddress);
            } else {
                console.log('No address components found');
            }

            console.log('Business card data extracted and populated successfully');
            return Promise.resolve();
        } else {
            console.error('No data in AI response');
            return context.executeAction('/MDKDemoApp/Actions/GenericToastMessage.action');
        }
    } catch (error) {
        console.error('Error scanning business card:', error);
        console.error('Error stack:', error.stack);
        return context.executeAction('/MDKDemoApp/Actions/GenericToastMessage.action');
    }
}
