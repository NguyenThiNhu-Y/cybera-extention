// overlay.js

// Create HTML for overlay
const overlayId = 'Cybera-ext-overlay-root';
const floatingButtonId = 'Cybera-ext-floating-button';
const selectionIconId = 'Cybera-ext-selection-icon';
const overlayTagId = 'Cybera-ext-overlay-tag-root';

// Store chat history
let chatHistory = [];

// Store token information
let tokenInfo = {
    name: null,
    symbol: null
};

// Store selected text
let selectedText = '';
let lastSelectedText = '';

// API configuration
const API_URL = 'http://127.0.0.1:8000/agent/private-chat';
// const API_URL = 'https://ai-agent-api.testnet.berally.io/v1/agent/private-chat';
const API_MULTIMODAL_URL = 'http://localhost:8000/llm/stream-multimodal';
const API_MODEL = 'claude-3.7-sonnet';
const AGENT_ID = "elchabera";
const AGENT_NAME = "elchabera";

// Flag to enable/disable API calls (fallback to simulated responses if disabled)
let apiEnabled = true;

// Function to clean response text from embedded metadata
function cleanResponseFromMetadata(text) {
    if (!text) return text;

    // Replace embedded metadata patterns with proper text
    // Pattern: content="'s" additional_kwargs={} response_metadata={} id='run-...'
    let cleanedText = text.replace(/content="'s"\s+additional_kwargs={}\s+response_metadata={}\s+id='run-[a-z0-9-]+'/g, "'s");

    // More generic pattern for any similar metadata
    cleanedText = cleanedText.replace(/content="([^"]*)"\s+additional_kwargs={}\s+response_metadata={}\s+id='run-[a-z0-9-]+'/g, "$1");

    return cleanedText;
}

// Function to check if API is available using XMLHttpRequest
function checkAPIAvailability(callback) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.onload = function () {
        apiEnabled = xhr.status >= 200 && xhr.status < 300;
        console.log(`API status: ${apiEnabled ? 'available' : 'unavailable'} (${xhr.status})`);
        if (callback) callback(apiEnabled);
    };

    xhr.onerror = function (event) {
        console.log('API check failed - Network error:', event);
        apiEnabled = false;
        if (callback) callback(false);
    };

    xhr.timeout = 5000; // 5 seconds timeout

    xhr.ontimeout = function () {
        console.log('API check timed out');
        apiEnabled = false;
        if (callback) callback(false);
    };

    // Send minimal query
    const data = JSON.stringify({
        query: 'Hello',
        model: API_MODEL
    });

    xhr.send(data);
}

// Check API availability on startup
checkAPIAvailability();

// Function to convert dataURL to base64 (remove the mime type prefix)
function dataURLToBase64(dataURL) {
    // dataURL format: data:image/jpeg;base64,/9j/4AAQ...
    return dataURL.split(',')[1];
}

function renderMarkdownToHtml(markdown) {
    if (!markdown) return '';

    // Escape special HTML to avoid bad HTML injection (basic)
    function escapeHtml(text) {
        return text.replace(/[&<>"']/g, function (m) {
            switch (m) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return m;
            }
        });
    }

    let html = escapeHtml(markdown);

    // Simple markdown conversions:

    // **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // list of - signs
    html = html.replace(/^\s*-\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

    // line break -> <br>
    html = html.replace(/\n/g, '<br>');

    // link [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // code `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    return html;
}


// Base function to process streaming response from all API calls
function processStreamingResponse(xhr, onThinkChunk, onMessageChunk, onComplete, onError) {
    let buffer = '';
    let responseText = '';
    let accumulatedContent = '';
    let shouldStop = false;
    let currentEvent = '';
    let messageBuffer = '';

    xhr.onprogress = function () {
        if (shouldStop) return;
        // Get new data
        const newData = xhr.responseText.substring(responseText.length);
        responseText = xhr.responseText;

        // Add new data to buffer
        buffer += newData;

        // Process lines from buffer
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in buffer
        buffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7);
            } else if (line.startsWith('data: ')) {
                const currentData = line.slice(6);
                console.log("currentData:", currentData);

                if (currentData === '[DONE]') {
                    if (messageBuffer) {
                        accumulatedContent += messageBuffer;
                        if (onMessageChunk) onMessageChunk(messageBuffer, accumulatedContent);
                        messageBuffer = '';
                    }
                    if (onComplete) onComplete(accumulatedContent);
                    return;
                }

                if (currentEvent === 'error') {
                    shouldStop = true;
                    if (onComplete) onComplete(accumulatedContent.trim());
                    return;
                }

                try {
                    if (currentEvent === 'think') {
                        const json = JSON.parse(currentData);
                        if (json.content && onThinkChunk) {
                            console.log("json.content ==", json.content)
                            const match = json.content.match(/\*\*(.+?)\*\*(.*)/s);
                            let title = 'Thinking...';
                            let detailsMarkdown = json.content;
                            let type = json.type

                            if (match) {
                                title = match[1].trim();
                                detailsMarkdown = match[2].trim();
                            }

                            // Convert markdown to HTML
                            let detailsHtml = renderMarkdownToHtml
                                ? renderMarkdownToHtml(detailsMarkdown)
                                : detailsMarkdown; // fallback returns raw markdown if no function

                            onThinkChunk({ title, detailsHtml, type }, accumulatedContent + '\n' + json.content);
                            accumulatedContent += json.content + '\n';
                        }
                    } else if (currentEvent === 'message') {
                        let processedData = currentData.replace(/<br\s*\/?>/gi, '\n');

                        // Add to buffer and emit as chunk
                        messageBuffer += processedData;

                        accumulatedContent += processedData;
                        // Process the chunk
                        if (onMessageChunk) onMessageChunk(processedData, accumulatedContent);
                        messageBuffer = ''; // Reset buffer if needed
                    }
                } catch (e) {
                    console.warn('Failed to parse data for event:', currentEvent, currentData);
                }

                currentEvent = '';
            }
        }
    };

    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            if (messageBuffer) {
                accumulatedContent += messageBuffer;
                if (onMessageChunk) onMessageChunk(messageBuffer, accumulatedContent);
                messageBuffer = '';
            }

            if (buffer && buffer.startsWith('data: ')) {
                const data = buffer.slice(6);
                console.log("data:", data);
                if (data !== '') {
                    const processedData = data.replace(/<br\s*\/?>/gi, '\n');
                    accumulatedContent += processedData;
                    if (onMessageChunk) onMessageChunk(processedData, accumulatedContent);
                }
            }

            if (onComplete) onComplete(accumulatedContent);
        } else {
            if (onError) {
                onError({
                    message: `HTTP error! Status: ${xhr.status}`,
                    status: xhr.status,
                    statusText: xhr.statusText
                });
            }
        }
    };

    // Handle network errors
    xhr.onerror = function (event) {

        if (onError) {
            onError({
                message: 'Network error occurred',
                event: event
            });
        }
    };

    // Handle timeouts
    xhr.ontimeout = function () {

        if (onError) {
            onError({
                message: 'Request timed out'
            });
        }
    };
}

// Function to call the LLM API with streaming response
function callLLMAPI(query, onChunk, onComplete, onError) {
    // Create EventSource for SSE
    const eventSource = new EventSource(`${API_URL}?query=${encodeURIComponent(query)}&model=${encodeURIComponent(API_MODEL)}`);

    // Handle incoming data chunks
    eventSource.onmessage = (event) => {
        const data = event.data;

        // Check if this is the end of the stream
        if (data === '[DONE]') {
            eventSource.close();
            if (onComplete) onComplete();
            return;
        }

        // Process the chunk
        if (onChunk) onChunk(data);
    };

    // Handle errors
    eventSource.onerror = (error) => {
        console.log('SSE Error:', error);
        eventSource.close();
        if (onError) onError(error);
    };

    return eventSource;
}

// Standard API call function for text-only queries
function callLLMAPIWithFetch(query, onThinkChunk, onMessageChunk, onComplete, onError) {
    // Create XMLHttpRequest
    const xhr = new XMLHttpRequest();

    // Setup request
    xhr.open('POST', API_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream'); // important for streaming
    // Set timeout (optional)
    xhr.timeout = 900000; // 15 minutes

    // Setup streaming response processing
    processStreamingResponse(xhr, onThinkChunk, onMessageChunk, onComplete, onError);

    // Send the request
    const data = JSON.stringify({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        message: query,
        stream: true,
        thread_id: "",
    });

    xhr.send(data);

    // Return an object that allows aborting the request
    return {
        abort: function () {
            xhr.abort();
            console.log('XHR request aborted');
        }
    };
}

// Multimodal API call function for text+image queries
function callMultimodalAPI(textPrompt, imageBase64, mimeType, onChunk, onComplete, onError) {
    // Create XMLHttpRequest
    const xhr = new XMLHttpRequest();

    // Setup request
    xhr.open('POST', API_MULTIMODAL_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');

    // Set timeout (optional) - longer for image processing
    xhr.timeout = 60000; // 60 seconds for image processing

    let buffer = '';
    let responseText = '';
    let accumulatedContent = ''; // Accumulated content for the entire response

    // Handle progress (streaming chunks)
    xhr.onprogress = function (event) {
        // Get new data
        const newData = xhr.responseText.substring(responseText.length);
        responseText = xhr.responseText;

        // Add new data to buffer
        buffer += newData;

        // Process lines from buffer
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in buffer
        buffer = lines.pop() || '';

        // Process complete lines
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                // Check if this is the standard format (data: content)
                if (line === 'data: [DONE]') {
                    const cleanedContent = cleanResponseFromMetadata(accumulatedContent);
                    if (onComplete) onComplete(cleanedContent);
                    return;
                }

                // Extract content from format: data: content='...' additional_kwargs={} response_metadata={} id='...'
                const contentMatch = line.match(/data: content='(.*?)' additional_kwargs/);

                if (contentMatch && contentMatch[1] !== undefined) {
                    // Process the chunk from the new format
                    const content = contentMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\'/g, "'")
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');

                    // Add to accumulated content
                    accumulatedContent += content;

                    // Clean content from any embedded metadata
                    const cleanedChunk = cleanResponseFromMetadata(content);
                    const cleanedAccumulated = cleanResponseFromMetadata(accumulatedContent);

                    // Pass the cleaned content to the callback
                    if (onChunk) onChunk(cleanedChunk, cleanedAccumulated);
                } else {
                    // Fall back to original format (data: content)
                    const content = line.substring(6); // Remove 'data: ' prefix

                    // Check if this is the end marker
                    if (content === '[DONE]') {
                        const cleanedContent = cleanResponseFromMetadata(accumulatedContent);
                        if (onComplete) onComplete(cleanedContent);
                        return;
                    }

                    // Add to accumulated content
                    accumulatedContent += content;

                    // Clean content from any embedded metadata
                    const cleanedChunk = cleanResponseFromMetadata(content);
                    const cleanedAccumulated = cleanResponseFromMetadata(accumulatedContent);

                    // Process the chunk
                    if (onChunk) onChunk(cleanedChunk, cleanedAccumulated);
                }
            }
        }
    };

    // Handle completion
    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            // Process any remaining buffer
            if (buffer && buffer.startsWith('data: ')) {
                // Check if it's the multimodal format
                const contentMatch = buffer.match(/data: content='(.*?)' additional_kwargs/);

                if (contentMatch && contentMatch[1] !== undefined) {
                    // Process the chunk from the new format
                    const content = contentMatch[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\'/g, "'")
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');

                    // Add to accumulated content
                    accumulatedContent += content;

                    // Clean content from any embedded metadata
                    const cleanedChunk = cleanResponseFromMetadata(content);
                    const cleanedAccumulated = cleanResponseFromMetadata(accumulatedContent);

                    // Pass the cleaned content to the callback
                    if (onChunk) onChunk(cleanedChunk, cleanedAccumulated);
                } else {
                    // Standard format
                    const content = buffer.substring(6); // Remove 'data: ' prefix
                    if (content && content !== '[DONE]') {
                        // Add to accumulated content
                        accumulatedContent += content;

                        // Clean content from any embedded metadata
                        const cleanedChunk = cleanResponseFromMetadata(content);
                        const cleanedAccumulated = cleanResponseFromMetadata(accumulatedContent);

                        if (onChunk) onChunk(cleanedChunk, cleanedAccumulated);
                    }
                }
            }

            // Final cleanup of the entire response
            const cleanedContent = cleanResponseFromMetadata(accumulatedContent);

            if (onComplete) onComplete(cleanedContent);
        } else {
            console.log('XHR Error Status:', xhr.status);
            console.log('XHR Error Details:', xhr.statusText);

            if (onError) {
                onError({
                    message: `HTTP error! Status: ${xhr.status}`,
                    status: xhr.status,
                    statusText: xhr.statusText
                });
            }
        }
    };

    // Handle network errors
    xhr.onerror = function (event) {
        console.log('XHR Network Error:', event);

        if (onError) {
            onError({
                message: 'Network error occurred',
                event: event
            });
        }
    };

    // Handle timeouts
    xhr.ontimeout = function () {
        console.log('XHR Timeout Error');

        if (onError) {
            onError({
                message: 'Request timed out'
            });
        }
    };

    // Send the request with text and image
    const data = JSON.stringify({
        text_prompt: textPrompt,
        model: API_MODEL,
        mime_type: mimeType || 'image/png',
        image_data: imageBase64
    });

    xhr.send(data);

    // Return an object that allows aborting the request
    return {
        abort: function () {
            xhr.abort();
            console.log('XHR request aborted');
        }
    };
}

// Function to simulate API response for fallback
function simulateResponse(query, onChunk, onComplete) {
    console.log('Using simulated response for:', query);

    // Generate appropriate simulated response based on query
    let simulatedResponse = '';

    if (query.includes('summarize') || query.toLowerCase().includes('summary')) {
        simulatedResponse = "Here's a summary of the webpage content:\n\nThis page appears to contain cryptocurrency or token information. The main topics include pricing data, market metrics, and possibly trading information. Key points observed: \n\n1. Token identification and basic information\n2. Price charts or current value indicators\n3. Market statistics like volume, market cap, or supply details\n4. Recent news or developments related to the token\n\nNote: This is a simulated response as the API connection is currently unavailable. For more accurate analysis, please ensure the API server is running.";
    }
    else if (query.includes('analyze') && query.includes('token')) {
        const tokenMatch = query.match(/analyze\s+(\w+)\s+token/i);
        const tokenSymbol = tokenMatch ? tokenMatch[1].toUpperCase() : tokenInfo.symbol || "this";

        simulatedResponse = `Based on the information visible on this page about ${tokenSymbol}:\n\n1. Overview: ${tokenSymbol} appears to be a cryptocurrency token with active trading.\n\n2. Key metrics: The page shows price information, market activity, and possibly volume data.\n\n3. Recent performance: Without live API access, specific trend analysis is limited.\n\n4. Considerations: Always research thoroughly before making any investment decisions related to this token.\n\nNote: This is a simulated response as the API connection is currently unavailable. For more accurate analysis, please ensure the API server is running.`;
    }
    else {
        simulatedResponse = `I've processed your query: "${query}"\n\nHowever, I'm currently operating in offline mode as the API connection was unsuccessful. To get the full capabilities:\n\n1. Ensure the API server is running at ${API_URL}\n2. Check for any CORS configuration issues\n3. Refresh the page to try reconnecting\n\nIn the meantime, I can still help with basic information based on what's visible on this page.`;
    }

    // Simulate streaming by sending chunks of the response
    const words = simulatedResponse.split(' ');
    let sentWords = 0;

    function sendNextChunk() {
        if (sentWords >= words.length) {
            if (onComplete) setTimeout(onComplete, 500);
            return;
        }

        // Send 3-7 words at a time to simulate typing
        const chunkSize = Math.floor(Math.random() * 5) + 3;
        const chunk = words.slice(sentWords, sentWords + chunkSize).join(' ') + ' ';
        sentWords += chunkSize;

        if (onChunk) onChunk(chunk);

        // Schedule next chunk with variable timing to simulate natural typing
        const delay = Math.floor(Math.random() * 150) + 50;
        setTimeout(sendNextChunk, delay);
    }

    // Start sending chunks with a slight initial delay
    setTimeout(sendNextChunk, 300);

    // Return an object that mimics the fetch API's return
    return {
        abort: () => console.log('Simulated response aborted')
    };
}

// Extract token information from webpage
function extractTokenInfo() {
    try {
        console.log('Attempting to extract token information...');

        // Look for token name and symbol in common elements
        // Method 1: Look for data-role attributes (CoinMarketCap structure)
        const tokenNameElement = document.querySelector('[data-role="coin-name"]');
        const tokenSymbolElement = document.querySelector('[data-role="coin-symbol"]');

        if (tokenNameElement) {
            tokenInfo.name = tokenNameElement.textContent.trim();
            console.log('Found token name:', tokenInfo.name);
        }

        if (tokenSymbolElement) {
            tokenInfo.symbol = tokenSymbolElement.textContent.trim();
            console.log('Found token symbol:', tokenInfo.symbol);
        }

        // Method 2: Look for meta tags
        if (!tokenInfo.name || !tokenInfo.symbol) {
            const metaTags = document.querySelectorAll('meta');
            metaTags.forEach(tag => {
                const content = tag.getAttribute('content');
                if (content) {
                    if (tag.getAttribute('name') === 'token:name' || tag.getAttribute('property') === 'token:name') {
                        tokenInfo.name = content;
                    }
                    if (tag.getAttribute('name') === 'token:symbol' || tag.getAttribute('property') === 'token:symbol') {
                        tokenInfo.symbol = content;
                    }
                }
            });
        }

        // Method 3: Look for common elements with token info
        // CoinMarketCap structure
        if (!tokenInfo.name || !tokenInfo.symbol) {
            const cmcNameElement = document.querySelector('.nameHeader, .namePill, .coin-title, h1.priceTitle, .sc-f70bb44c-0');
            if (cmcNameElement) {
                const text = cmcNameElement.textContent;
                // Extract name and symbol (often in format "Bitcoin (BTC)")
                const match = text.match(/([^\(]+)\s*(?:\(([^\)]+)\))?/);
                if (match) {
                    if (!tokenInfo.name && match[1]) tokenInfo.name = match[1].trim();
                    if (!tokenInfo.symbol && match[2]) tokenInfo.symbol = match[2].trim();
                }
            }
        }

        // Method 4: Look for HTML elements with specific classes/ids that might contain token info
        if (!tokenInfo.name || !tokenInfo.symbol) {
            const possibleNameElements = document.querySelectorAll('h1, .token-name, .coin-name, .crypto-name, .currency-name');
            const possibleSymbolElements = document.querySelectorAll('.token-symbol, .coin-symbol, .crypto-symbol, .currency-symbol');

            possibleNameElements.forEach(el => {
                const text = el.textContent.trim();
                if (text && !tokenInfo.name && text.length < 30) {
                    tokenInfo.name = text;
                }
            });

            possibleSymbolElements.forEach(el => {
                const text = el.textContent.trim();
                if (text && !tokenInfo.symbol && text.length < 10) {
                    tokenInfo.symbol = text;
                }
            });
        }

        // Method 5: Generic text search for patterns like "$BTC", "BTC/USDT"
        if (!tokenInfo.symbol) {
            const bodyText = document.body.textContent;
            const symbolRegex = /\$([A-Z]{2,10})\b|\b([A-Z]{2,10})\/[A-Z]{2,5}\b/g;
            const symbolMatches = bodyText.match(symbolRegex);

            if (symbolMatches) {
                // Get the most frequent match
                const counts = {};
                let maxCount = 0;
                let mostFrequent = null;

                symbolMatches.forEach(match => {
                    // Extract just the symbol part
                    const symbol = match.startsWith('$') ? match.substring(1) : match.split('/')[0];
                    counts[symbol] = (counts[symbol] || 0) + 1;

                    if (counts[symbol] > maxCount) {
                        maxCount = counts[symbol];
                        mostFrequent = symbol;
                    }
                });

                if (mostFrequent) {
                    tokenInfo.symbol = mostFrequent;
                }
            }
        }

        // If we found token info, log it
        if (tokenInfo.name || tokenInfo.symbol) {
            console.log('Token information found:', tokenInfo);
        } else {
            console.log('No token information found on this page');
        }
    } catch (error) {
        console.log('Error extracting token information:', error);
    }
}

// Create prompt for webpage summarization
function createSummarizePrompt(pageText) {
    return `Please summarize the following webpage content concisely. Focus on the main points, key information, and any significant data or statistics. Organize the summary in a clear, structured way:

Content to summarize:
${pageText}

Provide a summary that includes:
1. The main topic or purpose of the webpage
2. Key points and information
3. Any important data, statistics, or figures
4. Conclusions or main takeaways`;
}

// Create prompt for token analysis with chart focus
function createTokenAnalysisPrompt(tokenSymbol) {
    return `I'm looking at a chart and market data for the cryptocurrency token ${tokenSymbol}. Please analyze this token with focus on:

1. Chart patterns and price action visible in the screenshot
2. Key metrics visible on the page (price, market cap, volume, etc.)
3. Any notable recent performance or trends shown in the chart
4. Support and resistance levels if visible
5. Any risks or considerations based on the technical analysis

Please be specific about what you can see in the image and provide a thorough technical analysis.`;
}

function createOverlay(featureName) {
    if (document.getElementById(overlayId)) return;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.width = '33vw';
    overlay.style.height = '98vh';
    overlay.style.maxWidth = '69vw';
    overlay.style.minWidth = '520px';
    overlay.style.minHeight = '98vh';
    overlay.style.maxHeight = '98vh';
    overlay.style.background = '#0a0a0a'; // Đổi sang nền đen
    overlay.style.boxShadow = '0 0 40px rgba(255, 255, 255, 0.05)';
    overlay.style.zIndex = '999999';
    overlay.style.borderRadius = '12px 0 0 12px';
    overlay.style.border = '1px solid rgba(255,255,255,0.05)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
    overlay.style.transform = 'translateX(0)';


    // Collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '▶'; // hoặc '➔', '→', tuỳ style bạn thích
    collapseBtn.style.color = 'white'; // đảm bảo màu trắng
    collapseBtn.style.fontSize = '18px';
    collapseBtn.style.fontWeight = 'bold';

    collapseBtn.style.position = 'absolute';
    collapseBtn.style.left = '-32px';
    collapseBtn.style.top = '24px';
    collapseBtn.style.width = '32px';
    collapseBtn.style.height = '32px';
    collapseBtn.style.background = '#0f0f0f';
    collapseBtn.style.border = '1px solid #2a2a2a';
    collapseBtn.style.borderRadius = '50%';
    collapseBtn.style.boxShadow = '0 0 6px rgba(100, 100, 255, 0.3)';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.display = 'flex';
    collapseBtn.style.alignItems = 'center';
    collapseBtn.style.justifyContent = 'center';
    collapseBtn.title = 'Collapse';
    collapseBtn.style.transition = 'transform 0.3s ease, box-shadow 0.2s ease';

    collapseBtn.onmouseenter = () => {
        collapseBtn.style.boxShadow = '0 0 10px rgba(140, 140, 255, 0.4)';
    };
    collapseBtn.onmouseleave = () => {
        collapseBtn.style.boxShadow = '0 0 6px rgba(100, 100, 255, 0.3)';
    };
    collapseBtn.onclick = () => {
        const isCollapsed = overlay.style.transform === 'translateX(0px)';
        overlay.style.transform = isCollapsed ? 'translateX(100%)' : 'translateX(0px)';
        collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
        collapseBtn.textContent = isCollapsed ? '◀' : '▶'; // chuyển hướng
    };
    overlay.appendChild(collapseBtn);


    // Create chat interface
    const content = document.createElement('div');
    content.style.flex = '1';
    content.style.overflow = 'auto';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.height = '100%';
    content.style.background = '#0a0a0a'; // nền tối

    // Header for overlay
    const header = document.createElement('div');
    header.style.padding = '16px 20px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.background = '#111'; // header tone tối

    // Overlay title
    const title = document.createElement('div');
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.color = '#f5f5f5'; // chữ trắng
    title.textContent = featureName ? `${featureName}` : 'Chat with Cybera';
    header.appendChild(title);

    // Header actions container
    const headerActions = document.createElement('div');
    headerActions.style.display = 'flex';
    headerActions.style.gap = '12px';
    headerActions.style.alignItems = 'center';

    // Clear history button
    const clearHistoryBtn = document.createElement('button');
    clearHistoryBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"></path>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
    </svg>`;
    clearHistoryBtn.style.background = 'none';
    clearHistoryBtn.style.border = 'none';
    clearHistoryBtn.style.cursor = 'pointer';
    clearHistoryBtn.style.padding = '5px';
    clearHistoryBtn.title = 'Clear chat history';
    clearHistoryBtn.onclick = () => {
        clearChatHistory();

        // Hide suggestions
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'flex';
        }
    };
    headerActions.appendChild(clearHistoryBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6l-12 12"></path>
    <path d="M6 6l12 12"></path>
    </svg>`;
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '5px';
    closeBtn.onclick = () => {
        // Save chat history before closing the overlay
        saveChatHistory(chatContainer);
        removeOverlay();
        showFloatingButton();
    };
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);

    content.appendChild(header);

    // Container for chat messages
    const chatContainer = document.createElement('div');
    chatContainer.id = 'chat-messages-container';
    chatContainer.style.flex = '1';
    chatContainer.style.overflowY = 'auto';
    chatContainer.style.padding = '20px';
    chatContainer.style.background = '#0a0a0a'; // nền đen

    // Add welcome message if there's no chat history
    if (chatHistory.length === 0) {
        const welcomeMessage = document.createElement('div');
        welcomeMessage.style.padding = '12px 16px';
        welcomeMessage.style.background = '#1a1a1a'; // bong bóng chat tone đen nhạt
        welcomeMessage.style.borderRadius = '8px';
        welcomeMessage.style.marginBottom = '12px';
        welcomeMessage.style.maxWidth = '80%';
        welcomeMessage.style.wordBreak = 'break-word';
        welcomeMessage.style.color = '#f1f1f1'; // chữ trắng nhẹ
        welcomeMessage.style.boxShadow = '0 1px 4px rgba(255, 255, 255, 0.03)';

        if (featureName) {
            welcomeMessage.textContent = `Welcome to ${featureName}. How can I help you?`;
        } else {
            welcomeMessage.textContent = 'Hi! I\'m your Cybera assistant. How can I help you today?';
        }
        chatContainer.appendChild(welcomeMessage);

        // Add to chat history
        chatHistory.push({
            sender: 'assistant',
            message: welcomeMessage.textContent,
            timestamp: new Date().getTime()
        });
    } else {
        // Restore chat history
        restoreChatHistory(chatContainer);
    }

    content.appendChild(chatContainer);

    // Input box for chat
    const inputContainer = document.createElement('div');
    inputContainer.style.padding = '16px';
    inputContainer.style.borderTop = '1px solid #1f1f1f'; // viền tối
    inputContainer.style.display = 'flex';
    inputContainer.style.flexDirection = 'column';
    inputContainer.style.gap = '10px';
    inputContainer.style.background = '#0a0a0a'; // nền input

    // Create container for suggested questions - Now inside inputContainer for closer positioning
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.style.display = 'flex';
    suggestionsContainer.style.flexDirection = 'row'; // giống như ảnh là các nút nằm ngang
    suggestionsContainer.style.flexWrap = 'wrap'; // cho xuống dòng nếu chật
    suggestionsContainer.style.gap = '8px';
    suggestionsContainer.style.marginBottom = '8px';
    suggestionsContainer.style.alignItems = 'center'; // đẹp hơn

    // Create only 2 suggested questions
    const suggestedQuestions = [
        "Summarize this webpage",
        tokenInfo.symbol ? `Analyze ${tokenInfo.symbol} token` : "Analyze this token"
    ];

    suggestedQuestions.forEach(questionText => {
        const suggestedQuestion = document.createElement('div');
        suggestedQuestion.className = 'suggested-question';
        suggestedQuestion.style.padding = '8px 16px';
        suggestedQuestion.style.background = '#1f1f1f';              // tone đen sang hơn
        suggestedQuestion.style.color = '#e4e4e7';                   // text xám sáng
        suggestedQuestion.style.borderRadius = '16px';
        suggestedQuestion.style.maxWidth = '80%';
        suggestedQuestion.style.wordBreak = 'break-word';
        suggestedQuestion.style.cursor = 'pointer';
        suggestedQuestion.style.border = '1px solid #2a2a2a';        // thêm đường viền nhẹ
        suggestedQuestion.style.fontSize = '14px';
        suggestedQuestion.style.transition = 'background 0.2s ease';
        suggestedQuestion.style.boxShadow = '0 1px 2px rgba(0,0,0,0.3)';


        suggestedQuestion.onmouseenter = () => {
            suggestedQuestion.style.background = '#2a2a2a';
        };

        suggestedQuestion.onmouseleave = () => {
            suggestedQuestion.style.background = '#1f1f1f';
        };

        suggestedQuestion.textContent = questionText;

        // Add click event to use this suggestion
        suggestedQuestion.onclick = () => {
            loggedIn = false;
            if (!loggedIn) {
                // Chưa login => mở auth.html
                createLoginModalInsideOverlay();
                return;
            }

            // Create user message
            const userMessage = document.createElement('div');
            userMessage.style.padding = '12px 16px';
            userMessage.style.background = 'linear-gradient(to top, #2f2f2f, #000000)'; // gradient xám tối -> đen
            userMessage.style.color = '#e0e0e0';        // trắng thiên xám
            userMessage.style.borderRadius = '8px';
            userMessage.style.marginBottom = '12px';
            userMessage.style.maxWidth = '80%';
            userMessage.style.wordBreak = 'break-word';
            userMessage.style.marginLeft = 'auto';
            userMessage.style.fontSize = '14px';
            userMessage.style.lineHeight = '1.5';
            userMessage.textContent = questionText;

            const chatContainer = document.getElementById('chat-messages-container');
            chatContainer.appendChild(userMessage);

            // Hide suggestions
            const suggestionsContainer = document.getElementById('suggestions-container');
            if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
            }

            // Add to chat history
            chatHistory.push({
                sender: 'user',
                message: questionText,
                timestamp: new Date().getTime()
            });

            // Save chat history
            saveChatHistoryToStorage();

            // Add a bot message placeholder
            const botMessage = document.createElement('div');
            botMessage.style.padding = '12px 16px';
            botMessage.style.background = 'linear-gradient(to top, #1f1f1f, #000000)';  // gradient xám tối hơn -> đen
            botMessage.style.color = '#e0e0e0';
            botMessage.style.borderRadius = '8px';
            botMessage.style.marginBottom = '12px';
            botMessage.style.maxWidth = '80%';
            botMessage.style.wordBreak = 'break-word';
            botMessage.style.fontSize = '14px';
            botMessage.style.lineHeight = '1.5';

            // Add <style> for bouncing animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes bounce {
                    0%, 80%, 100% {
                        transform: translateY(0);
                    }
                    40% {
                        transform: translateY(-8px);
                    }
                }
                .typing-indicator span {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background-color: #a1a1aa; /* màu dot nhạt hơn nền một chút */
                    margin: 0 2px;
                    animation: bounce 0.6s infinite ease-in-out;
                }
            `;
            document.head.appendChild(style);

            // Create the typing indicator
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.style.display = 'inline-block';
            typingIndicator.style.padding = '6px 10px';
            typingIndicator.style.borderRadius = '8px';

            // Add 3 bouncing dots
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('span');
                dot.style.animationDelay = `${i * 0.1}s`;
                typingIndicator.appendChild(dot);
            }

            // Append to your bot message element
            botMessage.appendChild(typingIndicator);
            chatContainer.appendChild(botMessage);

            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Special handling for "Summarize this webpage"
            if (questionText === "Summarize this webpage") {
                // Function to extract all text including from span tags
                const extractAllText = () => {
                    // Get all text nodes and elements containing text
                    const allElements = document.querySelectorAll('body *');
                    let allText = '';

                    // First, get the main document text
                    allText += document.body.innerText + "\n\n";

                    // Then, specifically extract text from span elements
                    const spanElements = document.querySelectorAll('span');
                    if (spanElements.length > 0) {
                        allText += "--- TEXT FROM SPAN ELEMENTS ---\n";
                        spanElements.forEach(span => {
                            if (span.textContent.trim()) {
                                allText += span.textContent.trim() + "\n";
                            }
                        });
                    }

                    // Also get text from specific data attributes that might contain relevant info
                    const elementsWithDataAttrs = document.querySelectorAll('[data-role]');
                    if (elementsWithDataAttrs.length > 0) {
                        allText += "\n--- TEXT FROM DATA ATTRIBUTE ELEMENTS ---\n";
                        elementsWithDataAttrs.forEach(el => {
                            const role = el.getAttribute('data-role');
                            if (el.textContent.trim()) {
                                allText += `[${role}] ${el.textContent.trim()}\n`;
                            }
                        });
                    }

                    return allText;
                };

                // Extract text and create a summarization prompt
                const pageText = extractAllText();
                const prompt = createSummarizePrompt(pageText);

                console.log("=== SUMMARIZE PROMPT ===");
                console.log(prompt);
                console.log("=== END OF PROMPT ===");

                // Call API with the summary prompt
                let responseText = '';

                callLLMAPIWithFetch(
                    prompt,
                    // onThinkChunk
                    ({ title, detailsHtml }) => {
                        const thinkWrapper = document.createElement('div');
                        thinkWrapper.style.padding = '10px 16px';
                        thinkWrapper.style.background = '#2f3136';           // xám đậm tối mờ
                        thinkWrapper.style.borderRadius = '20px';            // bo tròn lớn
                        thinkWrapper.style.marginBottom = '10px';
                        // thinkWrapper.style.maxWidth = '70%';
                        thinkWrapper.style.cursor = 'pointer';
                        thinkWrapper.style.color = '#b0b3b8';                 // màu xám nhạt
                        thinkWrapper.style.wordBreak = 'break-word';
                        thinkWrapper.style.userSelect = 'none';
                        thinkWrapper.style.transition = 'background-color 0.25s ease, box-shadow 0.25s ease';

                        // Glow nhẹ khi hover
                        thinkWrapper.addEventListener('mouseenter', () => {
                        thinkWrapper.style.background = '#3b3e44';
                        thinkWrapper.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.4)';
                        });
                        thinkWrapper.addEventListener('mouseleave', () => {
                        thinkWrapper.style.background = '#2f3136';
                        thinkWrapper.style.boxShadow = 'none';
                        });

                        const titleElement = document.createElement('div');
                        titleElement.style.fontWeight = 'bold';
                        titleElement.textContent = title;

                        const detailsElement = document.createElement('div');
                        detailsElement.innerHTML = detailsHtml;
                        detailsElement.style.display = 'none';
                        detailsElement.style.marginTop = '6px';
                        detailsElement.style.color = '#6b7280';

                        thinkWrapper.addEventListener('click', () => {
                            const isVisible = detailsElement.style.display === 'block';
                            detailsElement.style.display = isVisible ? 'none' : 'block';
                        });

                        thinkWrapper.appendChild(titleElement);
                        thinkWrapper.appendChild(detailsElement);

                        chatContainer.insertBefore(thinkWrapper, botMessage);
                        chatContainer.scrollTop = chatContainer.scrollHeight;

                        saveThinkChunks();
                    },
                    // onMessageChunk: handle each chunk of the response
                    (chunk) => {
                        // Remove typing indicator if this is the first chunk
                        if (!responseText) {
                            botMessage.innerHTML = '';
                        }

                        // Add this chunk to the response
                        responseText += chunk;
                        botMessage.textContent = responseText;

                        // Scroll to bottom
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    },
                    // onComplete: when the response is complete
                    () => {
                        // Convert final markdown responseText to HTML
                        const finalHtml = renderMarkdownToHtml(responseText);

                        // Update the bot's message content in the UI
                        botMessage.innerHTML = finalHtml;
                        // Update chat history with the complete response
                        chatHistory.push({
                            sender: 'assistant',
                            message: responseText,
                            timestamp: new Date().getTime()
                        });

                        // Save chat history
                        saveChatHistoryToStorage();
                    },
                    // onError: handle API errors
                    (error) => {
                        // Replace typing indicator with error message
                        botMessage.innerHTML = '';
                        botMessage.textContent = `Sorry, I encountered an error: ${error.message || 'Unable to connect to the API'}. Please try again later.`;
                        botMessage.style.color = '#ef4444';

                        // Add to chat history
                        chatHistory.push({
                            sender: 'assistant',
                            message: botMessage.textContent,
                            timestamp: new Date().getTime()
                        });

                        // Save chat history
                        saveChatHistoryToStorage();
                    }
                );
            }
            // Handle "Analyze token" suggestion with multimodal API
            else if (questionText.startsWith("Analyze") && questionText.includes("token")) {
                // Create user message with the query
                const userMessage = document.createElement('div');
                userMessage.style.padding = '12px 16px';
                userMessage.style.background = 'linear-gradient(to top, #2f2f2f, #000000)'; // gradient xám tối -> đen
                userMessage.style.color = '#e0e0e0';        // trắng thiên xám
                userMessage.style.borderRadius = '8px';
                userMessage.style.marginBottom = '12px';
                userMessage.style.maxWidth = '80%';
                userMessage.style.wordBreak = 'break-word';
                userMessage.style.marginLeft = 'auto';
                userMessage.style.fontSize = '14px';
                userMessage.style.lineHeight = '1.5';
                userMessage.textContent = questionText;
                chatContainer.appendChild(userMessage);

                // Hide suggestions
                const suggestionsContainer = document.getElementById('suggestions-container');
                if (suggestionsContainer) {
                    suggestionsContainer.style.display = 'none';
                }

                // Add to chat history
                chatHistory.push({
                    sender: 'user',
                    message: questionText,
                    timestamp: new Date().getTime()
                });

                // Save chat history
                saveChatHistoryToStorage();

                // Create placeholder for bot response
                const botMessage = document.createElement('div');
                botMessage.style.padding = '12px 16px';
                botMessage.style.background = 'linear-gradient(to top, #1f1f1f, #000000)';  // gradient xám tối hơn -> đen
                botMessage.style.color = '#e0e0e0';
                botMessage.style.borderRadius = '8px';
                botMessage.style.marginBottom = '12px';
                botMessage.style.maxWidth = '80%';
                botMessage.style.wordBreak = 'break-word';
                botMessage.style.fontSize = '14px';
                botMessage.style.lineHeight = '1.5';
                botMessage.textContent = "Taking screenshot to analyze...";
                chatContainer.appendChild(botMessage);

                // If this is screenshot flow, continue as normal
                console.log("Attempting screenshot via background script...");

                // Create UI indicator
                const indicator = document.createElement('div');
                indicator.textContent = "📸 Preparing screenshot...";
                indicator.style.position = 'fixed';
                indicator.style.top = '10px';
                indicator.style.left = '50%';
                indicator.style.transform = 'translateX(-50%)';
                indicator.style.backgroundColor = 'rgba(0,0,0,0.7)';
                indicator.style.color = 'white';
                indicator.style.padding = '8px 16px';
                indicator.style.borderRadius = '4px';
                indicator.style.zIndex = '999999';
                document.body.appendChild(indicator);

                // Try to capture using chrome API via background script
                try {
                    // Save status to know if we need to restore overlay
                    const wasOverlayOpen = isOverlayOpen();
                    const previousURL = window.location.href;

                    // Close overlay completely before taking screenshot
                    if (wasOverlayOpen) {
                        removeOverlay();
                    }

                    // Create a prompt for token analysis
                    const tokenAnalysisPrompt = createTokenAnalysisPrompt(tokenInfo.symbol || "this");
                    let responseText = '';

                    // Small delay to ensure overlay is fully removed
                    setTimeout(() => {
                        // Request screenshot from background script
                        chrome.runtime.sendMessage(
                            { action: "takeScreenshot", url: previousURL },
                            (response) => {
                                // Restore overlay after screenshot if it was open before
                                if (wasOverlayOpen) {
                                    // Recreate overlay
                                    createOverlay();

                                    // Find the chat container and message in the new overlay
                                    const newChatContainer = document.getElementById('chat-messages-container');

                                    // Remove indicator
                                    if (document.body.contains(indicator)) {
                                        document.body.removeChild(indicator);
                                    }

                                    // Process after screenshot is taken
                                    if (response && response.success) {
                                        console.log("Screenshot captured successfully");

                                        // Extract base64 image data from the dataURL
                                        const imageBase64 = dataURLToBase64(response.dataUrl);
                                        const mimeType = 'image/jpeg'; // or determine from dataUrl

                                        // Find the messages in the recreated overlay
                                        if (newChatContainer) {
                                            // Find the user's query message and bot's response message
                                            const messages = newChatContainer.querySelectorAll('div');
                                            let latestUserMessage;
                                            let latestBotMessage;

                                            // Find the latest user message and bot message
                                            for (let i = messages.length - 1; i >= 0; i--) {
                                                const msg = messages[i];
                                                if (msg.style.marginLeft === 'auto' && !latestUserMessage) {
                                                    latestUserMessage = msg;
                                                } else if (!msg.style.marginLeft && !latestBotMessage) {
                                                    latestBotMessage = msg;
                                                }

                                                if (latestUserMessage && latestBotMessage) break;
                                            }

                                            // Remove existing messages to reorder them
                                            if (latestUserMessage && latestBotMessage) {
                                                latestUserMessage.remove();
                                                latestBotMessage.remove();

                                                // Add the screenshot to the user's message
                                                const previewContainer = document.createElement('div');
                                                previewContainer.style.marginTop = '10px';
                                                previewContainer.style.textAlign = 'center';

                                                const previewImage = document.createElement('img');
                                                previewImage.src = response.dataUrl;
                                                previewImage.style.maxWidth = '100%';
                                                previewImage.style.maxHeight = '200px';
                                                previewImage.style.borderRadius = '8px';
                                                previewImage.style.border = '1px solid #3f3f46';

                                                previewContainer.appendChild(previewImage);

                                                // Add preview to the user message
                                                latestUserMessage.appendChild(document.createElement('br'));
                                                latestUserMessage.appendChild(document.createElement('br'));
                                                latestUserMessage.appendChild(previewContainer);

                                                // Add messages back in correct order
                                                newChatContainer.appendChild(latestUserMessage);
                                                newChatContainer.appendChild(latestBotMessage);

                                                // Update bot message to show analysis is starting
                                                latestBotMessage.textContent = "I'll analyze the chart and market data for this token...";

                                                // Add a typing indicator
                                                // Add <style> for bouncing animation
                                                const style = document.createElement('style');
                                                style.textContent = `
                                                    @keyframes bounce {
                                                    0%, 80%, 100% {
                                                        transform: translateY(0);
                                                    }
                                                    40% {
                                                        transform: translateY(-8px);
                                                    }
                                                    }
                                                    .typing-indicator span {
                                                    display: inline-block;
                                                    width: 8px;
                                                    height: 8px;
                                                    border-radius: 50%;
                                                    background-color: #666;
                                                    margin: 0 2px;
                                                    animation: bounce 0.6s infinite ease-in-out;
                                                    }
                                                `;
                                                document.head.appendChild(style);

                                                // Create the typing indicator
                                                const typingIndicator = document.createElement('div');
                                                typingIndicator.className = 'typing-indicator';
                                                typingIndicator.style.display = 'inline-block';
                                                typingIndicator.style.padding = '6px 10px';
                                                typingIndicator.style.borderRadius = '8px';

                                                // Add 3 bouncing dots
                                                for (let i = 0; i < 3; i++) {
                                                    const dot = document.createElement('span');
                                                    dot.style.animationDelay = `${i * 0.1}s`;
                                                    typingIndicator.appendChild(dot);
                                                }

                                                // Append to your bot message element
                                                botMessage.appendChild(typingIndicator);

                                                // Scroll to bottom to ensure visibility
                                                newChatContainer.scrollTop = newChatContainer.scrollHeight;

                                                // Add 3-second delay before calling the API
                                                setTimeout(() => {
                                                    // Call the multimodal API
                                                    callMultimodalAPI(
                                                        tokenAnalysisPrompt,
                                                        imageBase64,
                                                        mimeType,
                                                        // onChunk: handle each chunk of the response
                                                        (chunk, fullContent) => {
                                                            // Remove typing indicator if this is the first chunk
                                                            if (responseText.length === 0) {
                                                                latestBotMessage.innerHTML = '';
                                                            }

                                                            // Update response text with the full accumulated content
                                                            responseText = fullContent;

                                                            // Replace newlines with <br> for HTML display
                                                            const htmlContent = responseText.replace(/\n/g, '<br>');
                                                            latestBotMessage.innerHTML = htmlContent;

                                                            // Scroll to bottom
                                                            newChatContainer.scrollTop = newChatContainer.scrollHeight;
                                                        },
                                                        // onComplete: when the response is complete
                                                        (fullContent) => {
                                                            // Final update with complete content
                                                            responseText = fullContent;

                                                            // Convert newlines to <br> for HTML display
                                                            const htmlContent = responseText.replace(/\n/g, '<br>');
                                                            latestBotMessage.innerHTML = htmlContent;

                                                            // Update chat history with the complete response
                                                            chatHistory.push({
                                                                sender: 'assistant',
                                                                message: responseText,
                                                                timestamp: new Date().getTime()
                                                            });

                                                            // Save chat history
                                                            saveChatHistoryToStorage();
                                                        },
                                                        // onError: handle API errors
                                                        (error) => {
                                                            // Replace typing indicator with error message
                                                            latestBotMessage.innerHTML = '';
                                                            latestBotMessage.textContent = `Sorry, I encountered an error analyzing the image: ${error.message || 'Unable to process the screenshot'}. Please try again later.`;
                                                            latestBotMessage.style.color = '#ef4444';

                                                            // Add to chat history
                                                            chatHistory.push({
                                                                sender: 'assistant',
                                                                message: latestBotMessage.textContent,
                                                                timestamp: new Date().getTime()
                                                            });

                                                            // Save chat history
                                                            saveChatHistoryToStorage();
                                                        }
                                                    );
                                                }, 500); // 3-second delay before calling API
                                            }
                                        }
                                    } else {
                                        console.log("Error capturing screenshot:", response?.error || "Unknown error");

                                        // Find the messages in the recreated overlay
                                        if (newChatContainer) {
                                            // Find the user's query message and bot's response message
                                            const messages = newChatContainer.querySelectorAll('div');
                                            let latestBotMessage;

                                            // Find the latest bot message (should be the last one)
                                            for (let i = messages.length - 1; i >= 0; i--) {
                                                const msg = messages[i];
                                                if (!msg.style.marginLeft) { // Bot messages don't have marginLeft: auto
                                                    latestBotMessage = msg;
                                                    break;
                                                }
                                            }

                                            if (latestBotMessage) {
                                                latestBotMessage.innerHTML = '';
                                                latestBotMessage.textContent = "Sorry, I couldn't capture the screenshot. Please try again or manually take a screenshot.";

                                                // Create error message with instructions
                                                const errorMsg = document.createElement('div');
                                                errorMsg.style.backgroundColor = '#1e1e1e';
                                                errorMsg.style.color = '#ffffff';
                                                errorMsg.style.borderRadius = '12px';
                                                errorMsg.style.padding = '16px';
                                                errorMsg.style.marginTop = '16px';
                                                errorMsg.style.width = '100%';
                                                errorMsg.style.boxSizing = 'border-box';

                                                errorMsg.innerHTML = `
                                                    <div style="color: #ef4444; font-weight: bold; margin-bottom: 8px;">Screenshot failed</div>
                                                    <p style="margin: 0 0 8px 0;">To manually capture this page:</p>
                                                    <ol style="padding-left: 20px; margin-bottom: 10px;">
                                                        <li>Press <strong>Ctrl+Shift+S</strong> (Windows/Linux) or <strong>Cmd+Shift+5</strong> (Mac)</li>
                                                        <li>Select the area to capture</li>
                                                        <li>Save the screenshot</li>
                                                    </ol>
                                                `;

                                                latestBotMessage.appendChild(document.createElement('br'));
                                                latestBotMessage.appendChild(document.createElement('br'));
                                                latestBotMessage.appendChild(errorMsg);

                                                // Update chat history
                                                chatHistory.push({
                                                    sender: 'assistant',
                                                    message: latestBotMessage.textContent,
                                                    timestamp: new Date().getTime()
                                                });

                                                // Save chat history
                                                saveChatHistoryToStorage();
                                            }
                                        }
                                    }
                                }
                            }
                        );
                    }, 300); // Small delay to ensure UI updates before screenshot
                } catch (e) {
                    console.log("Exception attempting screenshot:", e);

                    // Restore overlay if there was an error and it was open before
                    if (isOverlayOpen()) {
                        createOverlay();
                    }

                    // Remove indicator
                    if (document.body.contains(indicator)) {
                        document.body.removeChild(indicator);
                    }
                }
            }
            // Generic suggestion handling with API call
            else {
                // Call API with the question directly
                let responseText = '';

                callLLMAPIWithFetch(
                    questionText,
                    // onThinkChunk
                    ({ title, detailsHtml }) => {
                        const thinkWrapper = document.createElement('div');
                        thinkWrapper.style.padding = '10px 16px';
                        thinkWrapper.style.background = '#2f3136';           // xám đậm tối mờ
                        thinkWrapper.style.borderRadius = '20px';            // bo tròn lớn
                        thinkWrapper.style.marginBottom = '10px';
                        // thinkWrapper.style.maxWidth = '70%';
                        thinkWrapper.style.cursor = 'pointer';
                        thinkWrapper.style.color = '#b0b3b8';                 // màu xám nhạt
                        thinkWrapper.style.wordBreak = 'break-word';
                        thinkWrapper.style.userSelect = 'none';
                        thinkWrapper.style.transition = 'background-color 0.25s ease, box-shadow 0.25s ease';

                        // Glow nhẹ khi hover
                        thinkWrapper.addEventListener('mouseenter', () => {
                        thinkWrapper.style.background = '#3b3e44';
                        thinkWrapper.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.4)';
                        });
                        thinkWrapper.addEventListener('mouseleave', () => {
                        thinkWrapper.style.background = '#2f3136';
                        thinkWrapper.style.boxShadow = 'none';
                        });

                        const titleElement = document.createElement('div');
                        titleElement.style.fontWeight = 'bold';
                        titleElement.textContent = title;

                        const detailsElement = document.createElement('div');
                        detailsElement.innerHTML = detailsHtml;
                        detailsElement.style.display = 'none';
                        detailsElement.style.marginTop = '6px';
                        detailsElement.style.color = '#6b7280';

                        // Nếu nội dung có chứa link report, thì tạo khung đặc biệt
                        const reportLinkMatch = detailsHtml.match(/(https?:\/\/[^\s]+)/);
                        if (reportLinkMatch) {
                            const link = reportLinkMatch[1];
                            const reportBox = document.createElement('div');
                            reportBox.style.padding = '10px';
                            reportBox.style.background = '#f3f4f6';
                            reportBox.style.border = '1px solid #d1d5db';
                            reportBox.style.borderRadius = '6px';
                            reportBox.style.marginTop = '8px';
                            reportBox.style.color = '#111827';

                            reportBox.innerHTML = `
                                <strong>🔍 Đang lấy thông tin từ báo cáo:</strong><br>
                                <a href="${link}" target="_blank" style="color:#3b82f6;word-break:break-all">${link}</a>
                            `;

                            detailsElement.appendChild(reportBox);
                        } else {
                            // Nếu không có report thì vẫn hiện nội dung gốc
                            detailsElement.innerHTML = detailsHtml;
                        }

                        thinkWrapper.addEventListener('click', () => {
                            const isVisible = detailsElement.style.display === 'block';
                            detailsElement.style.display = isVisible ? 'none' : 'block';
                        });

                        thinkWrapper.appendChild(titleElement);
                        thinkWrapper.appendChild(detailsElement);

                        chatContainer.insertBefore(thinkWrapper, botMessage);
                        chatContainer.scrollTop = chatContainer.scrollHeight;

                        saveThinkChunks();
                    },
                    // onMessageChunk
                    (chunk) => {
                        if (!responseText) {
                            botMessage.innerHTML = '';
                        }
                        responseText += chunk;
                        botMessage.textContent = responseText;
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    },
                    // onComplete
                    () => {
                        // Convert final markdown responseText to HTML
                        const finalHtml = renderMarkdownToHtml(responseText);

                        // Update the bot's message content in the UI
                        botMessage.innerHTML = finalHtml;
                        chatHistory.push({
                            sender: 'assistant',
                            message: responseText,
                            timestamp: new Date().getTime()
                        });
                        saveChatHistoryToStorage();
                    },
                    // onError
                    (error) => {
                        botMessage.innerHTML = '';
                        botMessage.textContent = `Sorry, I encountered an error: ${error.message || 'Unable to connect to the API'}. Please try again later.`;
                        botMessage.style.color = '#ef4444';

                        chatHistory.push({
                            sender: 'assistant',
                            message: botMessage.textContent,
                            timestamp: new Date().getTime()
                        });
                        saveChatHistoryToStorage();
                    }
                );
            }
        };

        suggestionsContainer.appendChild(suggestedQuestion);
    });

    inputContainer.appendChild(suggestionsContainer);

    // Input and send button container
    const inputRowContainer = document.createElement('div');
    inputRowContainer.style.display = 'flex';
    inputRowContainer.style.alignItems = 'center';
    inputRowContainer.style.padding = '12px 16px';
    inputRowContainer.style.background = 'rgba(15, 15, 15, 0.85)'; // nền đen bóng mờ
    inputRowContainer.style.borderRadius = '20px';               // bo tròn lớn
    inputRowContainer.style.boxShadow = '0 0 10px 2px rgba(58, 123, 255, 0.3)'; // glow nhẹ


    const inputBox = document.createElement('input');
    inputBox.type = 'text';
    inputBox.placeholder = 'Type your message here...';
    inputBox.style.flex = '1';
    inputBox.style.padding = '12px 16px';
    inputBox.style.border = 'none';
    inputBox.style.outline = 'none';
    inputBox.style.borderRadius = '16px';  // bo tròn lớn
    inputBox.style.background = 'rgba(30, 30, 30, 0.6)'; // nền trong mờ
    inputBox.style.color = '#ccc'; // chữ sáng
    inputBox.style.fontSize = '14px';
    inputBox.style.caretColor = '#ccc'; // con trỏ trắng xám
    inputBox.style.transition = 'background-color 0.25s ease';
    inputBox.style.boxShadow = '0 2px 8px rgba(255, 255, 255, 0.1)'; // bóng trắng xám nhẹ

    // Hover/focus hiệu ứng bóng sáng hơn
    inputBox.addEventListener('focus', () => {
        inputBox.style.boxShadow = '0 2px 12px rgba(255, 255, 255, 0.2)';
    });
    inputBox.addEventListener('blur', () => {
        inputBox.style.boxShadow = '0 2px 8px rgba(255, 255, 255, 0.1)';
    });

    // Placeholder (không áp dụng được bằng setAttribute cho ::placeholder, nên dùng CSS class nếu cần đồng bộ rộng hơn)
    inputBox.placeholder = ''; // clear trước
    inputBox.setAttribute('placeholder', 'Type your message here...');


    // Placeholder style (tùy trình duyệt, tạo style giả sử dụng attribute)
    inputBox.setAttribute('style', inputBox.getAttribute('style') + `
    ::placeholder { color: #888888; }
    `);

    const sendButton = document.createElement('button');
    sendButton.textContent = '↑'; // icon hướng lên
    sendButton.style.background = 'radial-gradient(circle, #000000 0%, #1a1a1a 60%, #e5e5e5 100%)'; // tối tâm, sáng viền
    sendButton.style.border = '1px solid #d4d4d8'; // viền trắng xám
    sendButton.style.borderRadius = '50%';
    sendButton.style.width = '44px';
    sendButton.style.height = '44px';
    sendButton.style.display = 'flex';
    sendButton.style.alignItems = 'center';
    sendButton.style.justifyContent = 'center';
    sendButton.style.marginLeft = '12px';
    sendButton.style.cursor = 'pointer';
    sendButton.style.color = '#f4f4f5'; // chữ trắng nhẹ
    sendButton.style.fontWeight = 'bold';
    sendButton.style.fontSize = '18px';
    sendButton.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.1)';
    sendButton.style.transition = 'box-shadow 0.3s ease';
    
    sendButton.addEventListener('mouseenter', () => {
        sendButton.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.25)';
    });
    sendButton.addEventListener('mouseleave', () => {
        sendButton.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.1)';
    });
    


    inputRowContainer.appendChild(inputBox);
    inputRowContainer.appendChild(sendButton);

    inputContainer.appendChild(inputRowContainer);

    // Find and modify send message handler to hide suggestion when user sends a message
    // Create a function to handle hiding suggestion when message is sent
    const hideSuggestionsOnSend = () => {
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    };

    // For our new send message function
    const sendMessage = () => {
        const message = inputBox.value.trim();
        if (message) {
            // Add user message
            const userMessage = document.createElement('div');
            userMessage.style.padding = '12px 16px';
            userMessage.style.background = 'linear-gradient(to top, #2f2f2f, #000000)'; // gradient xám tối -> đen
            userMessage.style.color = '#e0e0e0';        // trắng thiên xám
            userMessage.style.borderRadius = '8px';
            userMessage.style.marginBottom = '12px';
            userMessage.style.maxWidth = '80%';
            userMessage.style.wordBreak = 'break-word';
            userMessage.style.marginLeft = 'auto';
            userMessage.style.fontSize = '14px';
            userMessage.style.lineHeight = '1.5';
            userMessage.textContent = message;
            chatContainer.appendChild(userMessage);

            // Hide suggestions
            hideSuggestionsOnSend();

            // Add to chat history
            chatHistory.push({
                sender: 'user',
                message: message,
                timestamp: new Date().getTime()
            });

            // Save chat history
            saveChatHistoryToStorage();

            // Clear input content
            inputBox.value = '';

            // Add a placeholder for the bot response
            const botMessage = document.createElement('div');
            botMessage.style.padding = '12px 16px';
            botMessage.style.background = 'linear-gradient(to top, #1f1f1f, #000000)';  // gradient xám tối hơn -> đen
            botMessage.style.color = '#e0e0e0';
            botMessage.style.borderRadius = '8px';
            botMessage.style.marginBottom = '12px';
            botMessage.style.maxWidth = '80%';
            botMessage.style.wordBreak = 'break-word';
            botMessage.style.fontSize = '14px';
            botMessage.style.lineHeight = '1.5';

            // Add <style> for bouncing animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes bounce {
                0%, 80%, 100% {
                    transform: translateY(0);
                }
                40% {
                    transform: translateY(-8px);
                }
                }
                .typing-indicator span {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: #666;
                margin: 0 2px;
                animation: bounce 0.6s infinite ease-in-out;
                }
            `;
            document.head.appendChild(style);

            // Create the typing indicator
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.style.display = 'inline-block';
            typingIndicator.style.padding = '6px 10px';
            typingIndicator.style.borderRadius = '8px';

            // Add 3 bouncing dots
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('span');
                dot.style.animationDelay = `${i * 0.1}s`;
                typingIndicator.appendChild(dot);
            }

            // Append to your bot message element
            botMessage.appendChild(typingIndicator);
            chatContainer.appendChild(botMessage);

            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Call the API with the user's message
            let responseText = '';

            callLLMAPIWithFetch(
                message,

                // onThinkChunk
                ({ title, detailsHtml, type }) => {
                    const thinkWrapper = document.createElement('div');
                    thinkWrapper.classList.add('thinking-temp');
                    thinkWrapper.style.padding = '10px 16px';
                    thinkWrapper.style.background = '#2f3136';           // xám đậm tối mờ
                    thinkWrapper.style.borderRadius = '20px';            // bo tròn lớn
                    thinkWrapper.style.marginBottom = '10px';
                    // thinkWrapper.style.maxWidth = '70%';
                    thinkWrapper.style.cursor = 'pointer';
                    thinkWrapper.style.color = '#b0b3b8';                 // màu xám nhạt
                    thinkWrapper.style.wordBreak = 'break-word';
                    thinkWrapper.style.userSelect = 'none';
                    thinkWrapper.style.transition = 'background-color 0.25s ease, box-shadow 0.25s ease';

                    // Glow nhẹ khi hover
                    thinkWrapper.addEventListener('mouseenter', () => {
                    thinkWrapper.style.background = '#3b3e44';
                    thinkWrapper.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.4)';
                    });
                    thinkWrapper.addEventListener('mouseleave', () => {
                    thinkWrapper.style.background = '#2f3136';
                    thinkWrapper.style.boxShadow = 'none';
                    });

                    const titleElement = document.createElement('div');
                    titleElement.style.fontWeight = '600';
                    titleElement.style.marginBottom = '6px';
                    titleElement.textContent = title;

                    if (type === "url") {
                        const link = detailsHtml;
                        const token = link.split("/").at(-1);
                        titleElement.textContent = `🔍 Getting information from report: ${token}`;

                        titleElement.style.color = '#ddd';
                        titleElement.style.fontWeight = '600';
                        titleElement.style.marginBottom = '8px';

                        const reportBox = document.createElement('div');
                        reportBox.style.padding = '12px 16px';
                        reportBox.style.background = 'rgba(15, 15, 15, 0.85)'; // nền đen bóng mờ
                        reportBox.style.border = '1.5px solid rgba(58, 123, 255, 0.5)'; // viền glow màu xanh dương nhạt
                        reportBox.style.borderRadius = '16px'; // bo tròn lớn
                        reportBox.style.marginTop = '6px';
                        reportBox.style.color = '#b0b3b8'; // chữ xám nhạt
                        reportBox.style.fontSize = '13px';
                        reportBox.style.wordBreak = 'break-word';
                        reportBox.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.3)'; // glow nhẹ

                        reportBox.innerHTML = `
        <a href="${link}" target="_blank" style="color:#3b82f6; text-decoration: underline; word-break: break-word;">
            ${link}
        </a>
    `;

                        thinkWrapper.appendChild(titleElement);
                        thinkWrapper.appendChild(reportBox);
                    } else {
                        const detailsElement = document.createElement('div');
                        detailsElement.innerHTML = detailsHtml;
                        detailsElement.style.display = 'block';
                        detailsElement.style.marginTop = '8px';
                        detailsElement.style.color = '#b0b3b8';                         // chữ xám nhạt
                        detailsElement.style.background = 'rgba(15, 15, 15, 0.85)';     // nền đen bóng mờ trong suốt
                        detailsElement.style.padding = '12px 16px';
                        detailsElement.style.borderRadius = '16px';                      // bo tròn lớn
                        detailsElement.style.fontSize = '13px';
                        detailsElement.style.lineHeight = '1.5';
                        detailsElement.style.boxShadow = 'inset 0 0 12px 1px rgba(58, 123, 255, 0.3)';  // glow nhẹ inset
                        detailsElement.style.wordBreak = 'break-word';
                        detailsElement.style.userSelect = 'text';    

                        thinkWrapper.appendChild(titleElement);
                        thinkWrapper.appendChild(detailsElement);
                    }


                    chatContainer.insertBefore(thinkWrapper, botMessage);
                    chatContainer.scrollTop = chatContainer.scrollHeight;

                    saveThinkChunks();

                    chatHistory.push({
                        sender: 'assistant',
                        type: 'think',
                        title,
                        detailsHtml,
                        timestamp: new Date().getTime()
                    });

                    saveChatHistoryToStorage();
                },

                // onMessageChunk
                (chunk) => {
                    if (!responseText) {
                        botMessage.innerHTML = '';
                    }
                    responseText += chunk;
                    botMessage.textContent = responseText;
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                },

                // onComplete
                () => {
                    const finalHtml = renderMarkdownToHtml(responseText);
                    botMessage.innerHTML = finalHtml;

                    chatHistory.push({
                        sender: 'assistant',
                        message: responseText,
                        timestamp: new Date().getTime()
                    });

                    const thinkingBlocks = Array.from(document.querySelectorAll('.thinking-temp'));
                    if (thinkingBlocks.length > 0) {
                        const container = document.createElement('div');
                        container.style.background = 'rgba(15, 15, 15, 0.9)';     // nền đen bóng mờ
                        container.style.borderRadius = '16px';                     // bo tròn lớn
                        container.style.boxShadow = '0 0 10px 2px rgba(58, 123, 255, 0.4)'; // glow nhẹ
                        container.style.marginBottom = '16px';
                        container.style.overflow = 'hidden';
                        container.style.userSelect = 'none';

                        const header = document.createElement('div');
                        header.style.maxWidth = '70%';
                        header.style.display = 'flex';
                        header.style.alignItems = 'center';
                        header.style.gap = '10px';
                        header.style.fontWeight = '600';
                        header.style.padding = '12px 16px';
                        header.style.color = '#b0b3b8';                 // chữ xám nhạt
                        header.style.cursor = 'pointer';
                        header.style.transition = 'background-color 0.3s ease';

                        header.addEventListener('mouseenter', () => {
                            header.style.background = 'rgba(58, 123, 255, 0.15)';
                        });
                        header.addEventListener('mouseleave', () => {
                            header.style.background = 'transparent';
                        });

                        const arrowIcon = document.createElement('span');
                        arrowIcon.textContent = '▶';
                        arrowIcon.style.display = 'inline-block';
                        arrowIcon.style.transition = 'transform 0.3s ease';
                        arrowIcon.style.color = 'white';  // tím nhẹ nổi bật

                        const headerText = document.createElement('span');
                        headerText.textContent = '🧠 Thought process';
                        headerText.style.userSelect = 'none';

                        header.appendChild(arrowIcon);
                        header.appendChild(headerText);

                        const inner = document.createElement('div');
                        inner.style.maxWidth = '70%';
                        inner.style.display = 'none';
                        inner.style.padding = '12px 16px';
                        inner.style.color = '#ccc';
                        inner.style.fontSize = '14px';
                        inner.style.lineHeight = '1.5';
                        inner.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
                        inner.style.userSelect = 'text';

                        thinkingBlocks.forEach(wrapper => {
                            const children = wrapper.children;
                            const maybeDetails = children[1];

                            if (
                                maybeDetails &&
                                maybeDetails.tagName === 'DIV' &&
                                maybeDetails.querySelector('a') === null
                            ) {
                                // Ẩn nội dung ban đầu
                                maybeDetails.style.display = 'none';

                                // Gán lại listener để cho phép mở/đóng
                                wrapper.style.cursor = 'pointer';
                                wrapper.addEventListener('click', () => {
                                    const isVisible = maybeDetails.style.display === 'block';
                                    maybeDetails.style.display = isVisible ? 'none' : 'block';
                                });
                            }

                            wrapper.classList.remove('thinking-temp');
                            wrapper.style.width = '100%';
                            inner.appendChild(wrapper);
                        });

                        header.addEventListener('click', () => {
                            const isVisible = inner.style.display === 'block';
                            inner.style.display = isVisible ? 'none' : 'block';
                            arrowIcon.textContent = isVisible ? '▼' : '▶';
                        });

                        container.appendChild(header);
                        container.appendChild(inner);
                        chatContainer.insertBefore(container, botMessage);
                    }

                    saveChatHistoryToStorage();
                },


                // onError
                (error) => {
                    botMessage.innerHTML = '';
                    botMessage.textContent = `Sorry, I encountered an error: ${error.message || 'Unable to connect to the API'}. Please try again later.`;
                    botMessage.style.color = '#ef4444';

                    chatHistory.push({
                        sender: 'assistant',
                        message: botMessage.textContent,
                        timestamp: new Date().getTime()
                    });

                    saveChatHistoryToStorage();
                }
            );


        }
    };

    // Handle sending messages
    sendButton.onclick = sendMessage;
    inputBox.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    content.appendChild(inputContainer);
    overlay.appendChild(content);

    document.body.appendChild(overlay);
    hideFloatingButton();

    // Add click outside event listener
    setupClickOutsideListener();
}

// Save chat history from DOM to variable
function saveChatHistory(chatContainer) {
    // We already have the chat history in memory, no need to extract from DOM
    // Just ensure it's saved to storage
    saveChatHistoryToStorage();
}

// Save chat history to Chrome storage
function saveChatHistoryToStorage() {
    if (chrome && chrome.storage) {
        chrome.storage.local.set({ 'cyberaChatHistory': chatHistory }, function () {
            console.log('Chat history saved to storage');
        });
    } else {
        // Fallback to localStorage if chrome.storage is not available
        try {
            localStorage.setItem('cyberaChatHistory', JSON.stringify(chatHistory));
        } catch (e) {
            console.log('Error saving chat history to localStorage', e);
        }
    }
}

function restoreChatHistory(chatContainer) {
    if (chatHistory.length === 0) return;

    chatContainer.innerHTML = '';

    const groupedMessages = [];
    let currentGroup = { messages: [], thinks: [] };

    // Nhóm lại theo các block assistant/user và think đi kèm
    chatHistory.forEach(item => {
        if (item.type === 'think') {
            currentGroup.thinks.push(item);
        } else {
            if (item.sender === 'assistant') {
                currentGroup.messages.push(item);
                groupedMessages.push(currentGroup);
                currentGroup = { messages: [], thinks: [] };
            } else {
                groupedMessages.push({ messages: [item], thinks: [] });
            }
        }
    });

    groupedMessages.forEach(group => {
        const { messages, thinks } = group;

        if (thinks.length > 0) {
            const container = document.createElement('div');
            container.style.marginBottom = '8px';

            // Toggle Header
            const header = document.createElement('div');
            header.style.maxWidth = '70%';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '10px';
            header.style.fontWeight = '600';
            header.style.padding = '12px 16px';
            header.style.color = '#b0b3b8';             // chữ xám nhạt
            header.style.userSelect = 'none';
            header.style.cursor = 'pointer';
            header.style.transition = 'background-color 0.3s ease, box-shadow 0.3s ease';
            header.style.borderRadius = '16px';         // bo tròn lớn

            // Hover hiệu ứng nhẹ
            header.addEventListener('mouseenter', () => {
            header.style.background = 'rgba(58, 123, 255, 0.15)';
            header.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.4)';
            });
            header.addEventListener('mouseleave', () => {
            header.style.background = 'transparent';
            header.style.boxShadow = 'none';
            });

            const arrowIcon = document.createElement('span');
            arrowIcon.textContent = '▶';
            arrowIcon.style.display = 'inline-block';
            arrowIcon.style.transition = 'transform 0.3s ease';
            arrowIcon.style.color = 'white'; // tím nhẹ nổi bật

            const headerText = document.createElement('span');
            headerText.textContent = '🧠 Thought process';
            headerText.style.userSelect = 'none';
            headerText.style.color = 'white';

            header.appendChild(arrowIcon);
            header.appendChild(headerText);

            const inner = document.createElement('div');
            inner.style.maxWidth = '70%';
            inner.style.display = 'none';
            inner.style.padding = '12px 16px';
            inner.style.background = 'rgba(15, 15, 15, 0.85)'; // nền đen bóng mờ
            inner.style.borderRadius = '16px';                 // bo tròn lớn
            inner.style.marginTop = '8px';
            inner.style.color = '#b0b3b8';                      // chữ xám nhạt
            inner.style.fontSize = '14px';
            inner.style.lineHeight = '1.5';
            inner.style.userSelect = 'text';
            inner.style.boxShadow = '0 0 10px 2px rgba(58, 123, 255, 0.3)'; // glow nhẹ

            // Render each think block
            thinks.forEach(item => {
                const isUrl = item.detailsHtml.startsWith('http');

                const thinkWrapper = document.createElement('div');
                thinkWrapper.style.padding = '12px 18px';
                thinkWrapper.style.background = '#2f3136';           // nền tối mờ
                thinkWrapper.style.borderRadius = '20px';            // bo tròn lớn
                thinkWrapper.style.marginBottom = '12px';
                // thinkWrapper.style.maxWidth = '70%';
                thinkWrapper.style.cursor = 'pointer';
                thinkWrapper.style.color = '#b0b3b8';                 // màu xám nhạt
                thinkWrapper.style.wordBreak = 'break-word';
                thinkWrapper.style.userSelect = 'none';
                thinkWrapper.style.transition = 'background-color 0.25s ease, box-shadow 0.25s ease';
                
                // Glow nhẹ khi hover
                thinkWrapper.addEventListener('mouseenter', () => {
                    thinkWrapper.style.background = '#3b3e44';
                    thinkWrapper.style.boxShadow = '0 0 10px 3px rgba(58, 123, 255, 0.4)';
                });
                thinkWrapper.addEventListener('mouseleave', () => {
                    thinkWrapper.style.background = '#2f3136';
                    thinkWrapper.style.boxShadow = 'none';
                });

                const titleElement = document.createElement('div');
                titleElement.style.fontWeight = '600';
                titleElement.style.marginBottom = '4px';
                titleElement.style.color = '#ddd';

                if (isUrl) {
                    const token = item.detailsHtml.split("/").at(-1);
                    titleElement.textContent = `🔍 Getting information from report: ${token}`;

                    const reportBox = document.createElement('div');
                    reportBox.style.padding = '12px 16px';
                    reportBox.style.background = 'rgba(15, 15, 15, 0.85)';    // nền đen bóng mờ
                    reportBox.style.border = '1.5px solid rgba(58, 123, 255, 0.5)'; // viền glow xanh nhạt
                    reportBox.style.borderRadius = '16px';                     // bo tròn lớn
                    reportBox.style.marginTop = '6px';
                    reportBox.style.color = '#b0b3b8';                          // chữ xám nhạt
                    reportBox.style.fontSize = '13px';
                    reportBox.style.wordBreak = 'break-word';
                    reportBox.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.3)'; // glow nhẹ


                    reportBox.innerHTML = `
            <a href="${item.detailsHtml}" target="_blank" style="color:#3b82f6;word-break:break-all; text-decoration: underline;">${item.detailsHtml}</a>
        `;

                    thinkWrapper.appendChild(titleElement);
                    thinkWrapper.appendChild(reportBox);
                } else {
                    titleElement.textContent = item.title;

                    const detailsElement = document.createElement('div');
                    detailsElement.innerHTML = item.detailsHtml;
                    detailsElement.style.display = 'none';
                    detailsElement.style.marginTop = '8px';
                    detailsElement.style.color = '#b0b3b8';                     // chữ xám nhạt
                    detailsElement.style.background = 'rgba(15, 15, 15, 0.85)'; // nền tối mờ
                    detailsElement.style.padding = '12px 16px';
                    detailsElement.style.borderRadius = '16px';                 // bo tròn lớn
                    detailsElement.style.fontSize = '13px';
                    detailsElement.style.lineHeight = '1.5';
                    detailsElement.style.boxShadow = 'inset 0 0 12px 1px rgba(58, 123, 255, 0.3)';  // glow inset nhẹ
                    detailsElement.style.wordBreak = 'break-word';
                    detailsElement.style.userSelect = 'text';

                    thinkWrapper.style.cursor = 'pointer';
                    thinkWrapper.addEventListener('click', () => {
                        const isVisible = detailsElement.style.display === 'block';
                        detailsElement.style.display = isVisible ? 'none' : 'block';
                    });

                    thinkWrapper.appendChild(titleElement);
                    thinkWrapper.appendChild(detailsElement);
                }
                
                thinkWrapper.style.width = '100%';
                inner.appendChild(thinkWrapper);
            });


            // Toggle logic
            header.addEventListener('click', () => {
                const isVisible = inner.style.display === 'block';
                inner.style.display = isVisible ? 'none' : 'block';
                arrowIcon.textContent = isVisible ? '▶' : '▼';
            });

            container.appendChild(header);
            container.appendChild(inner);
            chatContainer.appendChild(container);
        }

        // Add messages (user or assistant)
        console.log("messages ======")
        console.log(messages)
        messages.forEach(item => {
            if (!item.message || typeof item.message !== 'string' || item.message.trim() === '') {
                return; // bỏ qua message rỗng
            }

            const messageElement = document.createElement('div');
            messageElement.style.padding = '12px 16px';
            messageElement.style.borderRadius = '8px';
            messageElement.style.marginBottom = '12px';
            messageElement.style.maxWidth = '80%';
            messageElement.style.wordBreak = 'break-word';
            messageElement.style.fontSize = '14px';
            messageElement.style.lineHeight = '1.5';
            messageElement.style.color = '#e0e0e0'; // chữ trắng thiên xám
            messageElement.style.background = 'linear-gradient(to top, #2c2c2c, #000000)'; // gradient xám -> đen

            if (item.sender === 'user') {
                messageElement.style.marginLeft = 'auto'; // căn phải
                messageElement.style.background = 'linear-gradient(to top, #3a3a3a, #000000)'; // xám đậm hơn cho user
            } else {
                messageElement.style.background = 'linear-gradient(to top, #2c2c2c, #000000)'; // xám đen cho bot
            }

            const message = renderMarkdownToHtml(item.message);
            messageElement.innerHTML = message;

            chatContainer.appendChild(messageElement);
        });
    });

    setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
}


// Load chat history from storage when page loads
function loadChatHistoryFromStorage() {
    if (chrome && chrome.storage) {
        chrome.storage.local.get('cyberaChatHistory', function (result) {
            if (result.cyberaChatHistory) {
                chatHistory = result.cyberaChatHistory;
                console.log('Chat history loaded from storage', chatHistory.length, 'messages');
            }
        });
    } else {
        // Fallback to localStorage if chrome.storage is not available
        try {
            const savedHistory = localStorage.getItem('cyberaChatHistory');
            if (savedHistory) {
                chatHistory = JSON.parse(savedHistory);
                console.log('Chat history loaded from localStorage', chatHistory.length, 'messages');
            }
        } catch (e) {
            console.log('Error loading chat history from localStorage', e);
        }
    }
}

// Clear chat history
function clearChatHistory() {
    chatHistory = [];

    if (chrome && chrome.storage) {
        chrome.storage.local.remove('cyberaChatHistory', function () {
            console.log('Chat history cleared from storage');
        });
    } else {
        // Fallback to localStorage if chrome.storage is not available
        try {
            localStorage.removeItem('cyberaChatHistory');
        } catch (e) {
            console.log('Error clearing chat history from localStorage', e);
        }
    }

    // Also clear the chat container if it exists
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer) {
        chatContainer.innerHTML = '';

        // Add a welcome message again
        const welcomeMessage = document.createElement('div');
        welcomeMessage.style.padding = '12px 16px';
        welcomeMessage.style.background = '#f4f4f5';
        welcomeMessage.style.borderRadius = '8px';
        welcomeMessage.style.marginBottom = '12px';
        welcomeMessage.style.maxWidth = '80%';
        welcomeMessage.style.wordBreak = 'break-word';
        welcomeMessage.textContent = 'Hi! I\'m your Cybera assistant. How can I help you today?';
        chatContainer.appendChild(welcomeMessage);

        // Add to chat history
        chatHistory.push({
            sender: 'assistant',
            message: welcomeMessage.textContent,
            timestamp: new Date().getTime()
        });

        saveChatHistoryToStorage();
    }
}

function removeOverlay() {
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        // Save chat history before removing
        const chatContainer = document.getElementById('chat-messages-container');
        if (chatContainer) {
            saveChatHistory(chatContainer);
        }

        overlay.remove();
        // Remove the click outside listener when closing the overlay
        removeClickOutsideListener();
    }
}

// Handle clicking outside the overlay
function setupClickOutsideListener() {
    document.addEventListener('click', handleClickOutside);
}

function removeClickOutsideListener() {
    document.removeEventListener('click', handleClickOutside);
}

function handleClickOutside(event) {
    const overlay = document.getElementById(overlayId);
    const floatingButton = document.getElementById(floatingButtonId);

    // If we clicked outside the overlay and not on the floating button
    if (overlay &&
        !overlay.contains(event.target) &&
        (!floatingButton || !floatingButton.contains(event.target))) {
        // Save chat history before closing
        const chatContainer = document.getElementById('chat-messages-container');
        if (chatContainer) {
            saveChatHistory(chatContainer);
        }

        removeOverlay();
        showFloatingButton();
    }
}

function toggleOverlay(featureName) {
    if (document.getElementById(overlayId)) {
        removeOverlay();
        showFloatingButton();
    } else {
        createOverlay(featureName);
    }
}

// Check if overlay is open
function isOverlayOpen() {
    return !!document.getElementById(overlayId);
}

function saveThinkChunks() {
    const wrappers = document.querySelectorAll('.think-wrapper');
    const thinkChunks = [];

    wrappers.forEach(wrapper => {
        const title = wrapper.querySelector('.think-title')?.textContent || '';
        const details = wrapper.querySelector('.think-details')?.innerHTML || '';
        thinkChunks.push({ title, detailsHtml: details });
    });

    localStorage.setItem('thinkChunks', JSON.stringify(thinkChunks));
}

function restoreThinkChunks(container) {
    const stored = localStorage.getItem('thinkChunks');
    if (!stored) return;

    const chunks = JSON.parse(stored);
    chunks.forEach(({ title, detailsHtml }) => {
        const thinkWrapper = document.createElement('div');
        thinkWrapper.className = 'think-wrapper';
        thinkWrapper.style.padding = '10px 16px';
        thinkWrapper.style.background = '#2f3136';           // xám đậm tối mờ
        thinkWrapper.style.borderRadius = '20px';            // bo tròn lớn
        thinkWrapper.style.marginBottom = '10px';
        // thinkWrapper.style.maxWidth = '70%';
        thinkWrapper.style.cursor = 'pointer';
        thinkWrapper.style.color = '#b0b3b8';                 // màu xám nhạt
        thinkWrapper.style.wordBreak = 'break-word';
        thinkWrapper.style.userSelect = 'none';
        thinkWrapper.style.transition = 'background-color 0.25s ease, box-shadow 0.25s ease';

        // Glow nhẹ khi hover
        thinkWrapper.addEventListener('mouseenter', () => {
        thinkWrapper.style.background = '#3b3e44';
        thinkWrapper.style.boxShadow = '0 0 8px 2px rgba(58, 123, 255, 0.4)';
        });
        thinkWrapper.addEventListener('mouseleave', () => {
        thinkWrapper.style.background = '#2f3136';
        thinkWrapper.style.boxShadow = 'none';
        });

        const titleElement = document.createElement('div');
        titleElement.className = 'think-title';
        titleElement.style.fontWeight = 'bold';
        titleElement.textContent = title;

        const detailsElement = document.createElement('div');
        detailsElement.className = 'think-details';
        detailsElement.innerHTML = detailsHtml;
        detailsElement.style.display = 'none';
        detailsElement.style.marginTop = '6px';
        detailsElement.style.color = '#6b7280';

        thinkWrapper.appendChild(titleElement);
        thinkWrapper.appendChild(detailsElement);

        thinkWrapper.addEventListener('click', () => {
            const isVisible = detailsElement.style.display === 'block';
            detailsElement.style.display = isVisible ? 'none' : 'block';
        });

        container.appendChild(thinkWrapper);
    });
}


// Create floating button in bottom right corner
function createFloatingButton() {
    if (document.getElementById(floatingButtonId)) return;

    const floatingButton = document.createElement('div');
    floatingButton.id = floatingButtonId;
    floatingButton.style.position = 'fixed';
    floatingButton.style.bottom = '20px';
    floatingButton.style.right = '20px';
    floatingButton.style.width = '48px';
    floatingButton.style.height = '48px';
    floatingButton.style.borderRadius = '50%';
    floatingButton.style.background = 'radial-gradient(circle, #000000 0%, #1a1a1a 60%, #e5e5e5 100%)';
    floatingButton.style.border = '1px solid #d4d4d8';
    floatingButton.style.display = 'flex';
    floatingButton.style.alignItems = 'center';
    floatingButton.style.justifyContent = 'center';
    floatingButton.style.cursor = 'pointer';
    floatingButton.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.1)';
    floatingButton.style.transition = 'box-shadow 0.3s ease';
    floatingButton.style.zIndex = '999998';

    // Icon for button
    floatingButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
    `;

    // Add hover effect
    floatingButton.onmouseover = () => {
        floatingButton.style.transform = 'scale(1.1)';
    };

    floatingButton.onmouseout = () => {
        floatingButton.style.transform = 'scale(1)';
    };

    // Open overlay when button is clicked
    floatingButton.onclick = (e) => {
        // Prevent the click from bubbling up to document
        e.stopPropagation();
        createOverlay();
        floatingButton.style.display = 'none';
    };

    document.body.appendChild(floatingButton);
}

function showFloatingButton() {
    const floatingButton = document.getElementById(floatingButtonId);
    if (floatingButton) {
        floatingButton.style.display = 'flex';
    } else {
        createFloatingButton();
    }
}

function hideFloatingButton() {
    const floatingButton = document.getElementById(floatingButtonId);
    if (floatingButton) {
        floatingButton.style.display = 'none';
    }
}

// Listen for messages from background and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.toggleOverlay) {
        // If there's information about the selected feature, pass it to toggleOverlay
        toggleOverlay(msg.featureName);
    }

    // Handle overlay status check
    if (msg && msg.checkOverlayStatus) {
        sendResponse({ isOpen: isOverlayOpen() });
    }

    // Handle clearing chat history
    if (msg && msg.clearChatHistory) {
        clearChatHistory();
        sendResponse({ success: true });
    }

    // Must return true when using asynchronous sendResponse
    return true;
});

// Extract token information when page loads
function runOnPageLoad() {
    console.log('Page loaded, extracting token information...');

    // Clear chat history to ensure a fresh suggestion on page reload
    // Only if we're actively debugging - comment this out for production
    // clearChatHistory();

    // Extract token information
    extractTokenInfo();

    // Load chat history
    loadChatHistoryFromStorage();

    // Create floating button
    createFloatingButton();
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runOnPageLoad);
} else {
    runOnPageLoad();
}

// Function to create and show icon near selected text
function showSelectionIcon(x, y, selText) {
    // Remove any existing selection icon
    removeSelectionIcon();

    // Store the selected text for later use
    lastSelectedText = selText || '';

    console.log("Showing selection icon at coordinates:", x, y);
    console.log("Stored selected text:", lastSelectedText.substring(0, 50) + (lastSelectedText.length > 50 ? "..." : ""));

    // Create the selection icon
    const icon = document.createElement('div');
    icon.id = selectionIconId;
    icon.style.position = 'absolute';
    icon.style.top = `${y}px`;
    icon.style.left = `${x}px`;
    icon.style.width = '32px';
    icon.style.height = '32px';
    icon.style.borderRadius = '50%';
    icon.style.backgroundColor = '#7e22ce'; // Same as floating button
    icon.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    icon.style.cursor = 'pointer';
    icon.style.zIndex = '999999';
    icon.style.display = 'flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.transition = 'transform 0.2s ease';

    // Add Cybera logo or icon
    icon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 8v8"></path>
            <path d="M8 12h8"></path>
        </svg>
    `;

    // Add hover effect
    icon.onmouseover = () => {
        icon.style.transform = 'scale(1.1)';
    };

    icon.onmouseout = () => {
        icon.style.transform = 'scale(1)';
    };

    // Add click handler
    icon.addEventListener('click', function (e) {
        console.log("Selection icon clicked!");
        e.preventDefault();
        e.stopPropagation();

        try {
            // Use the stored selected text instead of trying to get it again
            const text = lastSelectedText;
            console.log("Using stored selected text:", text.substring(0, 50) + (text.length > 50 ? "..." : ""));

            if (text) {
                selectedText = text;

                // Open the overlay if not already open
                if (!isOverlayOpen()) {
                    console.log("Opening overlay for selected text");
                    createOverlay();
                } else {
                    console.log("Overlay already open");
                }

                // Small delay to ensure overlay is created
                setTimeout(() => {
                    // Set the selected text in the input box
                    const inputBox = document.querySelector('#' + overlayId + ' input[type="text"]');
                    if (inputBox) {
                        console.log("Setting input box value to selected text");
                        inputBox.value = text;
                        inputBox.focus();
                    } else {
                        console.error("Could not find input box in overlay");
                    }

                    // Generate questions from selected text
                    console.log("Calling API to generate questions");
                    generateQuestionsFromSelection(text, (questions) => {
                        console.log("Question generation callback received:", questions);

                        if (questions && questions.length > 0) {
                            // Get suggestions container
                            const suggestionsContainer = document.getElementById('suggestions-container');
                            if (suggestionsContainer) {
                                console.log("Updating suggestions container with generated questions");
                                // Clear existing suggestions
                                suggestionsContainer.innerHTML = '';

                                // Add new suggestions based on the questions
                                questions.forEach(question => {
                                    if (question && question.trim()) {
                                        const suggestedQuestion = document.createElement('div');
                                        suggestedQuestion.className = 'suggested-question';
                                        suggestedQuestion.style.padding = '8px 16px';
                                        suggestedQuestion.style.background = '#18181b';
                                        suggestedQuestion.style.color = '#ffffff';
                                        suggestedQuestion.style.borderRadius = '16px';
                                        suggestedQuestion.style.maxWidth = '80%';
                                        suggestedQuestion.style.wordBreak = 'break-word';
                                        suggestedQuestion.style.cursor = 'pointer';
                                        suggestedQuestion.style.border = 'none';
                                        suggestedQuestion.style.fontSize = '14px';
                                        suggestedQuestion.style.marginBottom = '8px';

                                        suggestedQuestion.textContent = question;

                                        // Add click event to use this suggestion
                                        suggestedQuestion.onclick = () => {
                                            // Put selected text in the input box
                                            const inputBox = document.querySelector('#' + overlayId + ' input[type="text"]');
                                            if (inputBox) {
                                                inputBox.value = question;
                                            }

                                            // Trigger a click on the send button
                                            const sendButton = inputBox.nextElementSibling;
                                            if (sendButton) {
                                                sendButton.click();
                                            }
                                        };

                                        suggestionsContainer.appendChild(suggestedQuestion);
                                    }
                                });

                                // Make sure suggestions are visible
                                suggestionsContainer.style.display = 'flex';
                            } else {
                                console.error("Could not find suggestions container");
                            }
                        } else {
                            console.error("No questions were generated or API call failed");
                        }
                    });
                }, 300);
            } else {
                console.error("No text selected when icon was clicked");
            }
        } catch (error) {
            console.error("Error in selection icon click handler:", error);
        }

        // Remove the selection icon
        removeSelectionIcon();
    });

    document.body.appendChild(icon);

    // Auto-remove after 3 seconds of inactivity
    setTimeout(removeSelectionIcon, 3000);
}

// Function to generate questions from selected text
function generateQuestionsFromSelection(text, callback) {
    if (!text || text.trim().length < 10) {
        console.log("Selected text too short for question generation");
        if (callback) callback([]);
        return;
    }

    const prompt = `Based on the following text, generate exactly 3 relevant questions that someone might ask about this content. Return ONLY the 3 questions separated by commas, with no additional text, explanations, or formatting:

Text: "${text}"`;

    console.log("Generating questions for selected text...");
    console.log("API URL:", API_URL);
    console.log("Using model: claude-3.5-haiku for suggestions");

    try {
        // Create XMLHttpRequest
        const xhr = new XMLHttpRequest();

        // Setup request
        xhr.open('POST', API_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');

        // Set timeout
        xhr.timeout = 15000; // 15 seconds

        let completeResponse = '';
        let buffer = '';

        // Handle progress (streaming chunks)
        xhr.onprogress = function (event) {
            console.log("Received data from API:", event.loaded, "bytes");

            // Get only the new part of the response
            const newContent = xhr.responseText.substring(buffer.length);
            buffer = xhr.responseText;

            // Process new lines
            const lines = newContent.split('\n');
            for (const line of lines) {
                if (line.trim() === '') continue;

                console.log("Processing line:", line);

                if (line.startsWith('data: ')) {
                    // Check if this is the end marker
                    if (line === 'data: [DONE]') {
                        console.log("Received DONE marker");
                        continue;
                    }

                    // Extract content from the line
                    let content = '';

                    // Try the structured format first
                    const contentMatch = line.match(/data: content='(.*?)' additional_kwargs/);
                    if (contentMatch && contentMatch[1] !== undefined) {
                        content = contentMatch[1]
                            .replace(/\\n/g, '\n')
                            .replace(/\\'/g, "'")
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\');
                    } else {
                        // Otherwise just take everything after "data: "
                        content = line.substring(6).trim();
                        if (content === '[DONE]') continue;
                    }

                    console.log("Extracted content:", content);

                    // Add to the complete response
                    completeResponse += content;
                }
            }
        };

        // Handle completion
        xhr.onload = function () {
            console.log("API request completed with status:", xhr.status);
            if (xhr.status >= 200 && xhr.status < 300) {
                // Process the full response to extract questions
                console.log("Complete response text:", completeResponse);

                // Clean up the response - remove any trailing data: markers
                completeResponse = completeResponse.replace(/data:\s*/g, '');

                // Remove [DONE] if it's in there
                completeResponse = completeResponse.replace(/\[DONE\]/g, '');

                // Split by commas to get the questions - but rebuild them properly
                let questions = [];

                // Instead of a simple split, we'll try to intelligently build 3 questions
                // First try a simple comma split in case the API followed the format correctly
                const simpleSplit = completeResponse.split(',').map(q => q.trim());

                if (simpleSplit.length === 3) {
                    // If we got 3 questions, use them
                    questions = simpleSplit;
                } else if (simpleSplit.length > 3) {
                    // If we got more than 3 segments, try to combine them into 3 questions
                    let currentQuestion = '';
                    let questionCount = 0;

                    for (let i = 0; i < simpleSplit.length; i++) {
                        const part = simpleSplit[i].trim();

                        // Skip empty parts
                        if (!part) continue;

                        // If this is a new question (starts with uppercase)
                        if (part.match(/^[A-Z]/) && i > 0) {
                            // Save the previous question if we have one
                            if (currentQuestion) {
                                questions.push(currentQuestion.trim());
                                currentQuestion = '';
                                questionCount++;

                                // If we already have 3 questions, add all remaining parts to the last one
                                if (questionCount >= 2) {
                                    questions.push(simpleSplit.slice(i).join(', ').trim());
                                    break;
                                }
                            }
                        }

                        // Add this part to the current question
                        if (currentQuestion) {
                            currentQuestion += ', ' + part;
                        } else {
                            currentQuestion = part;
                        }
                    }

                    // Add the last question if we haven't already
                    if (currentQuestion && questions.length < 3) {
                        questions.push(currentQuestion.trim());
                    }
                } else {
                    // If comma splitting didn't work, try to identify questions by capitalization
                    // and common question starters like "What", "How", "Why", etc.
                    const questionStarters = ['What', 'How', 'Why', 'When', 'Where', 'Who', 'Which', 'Is', 'Are', 'Can', 'Do', 'Does'];

                    let lastIndex = 0;

                    // Loop through the response looking for question starters
                    for (const starter of questionStarters) {
                        const regex = new RegExp('\\b' + starter + '\\b', 'g');
                        let match;

                        while ((match = regex.exec(completeResponse)) !== null) {
                            // If this match is after the last index and we don't have 3 questions yet
                            if (match.index > lastIndex && questions.length < 3) {
                                // Get the text from this starter to the next starter or end
                                let endIndex = completeResponse.length;

                                // Look for the next question starter after this match
                                for (const nextStarter of questionStarters) {
                                    const nextRegex = new RegExp('\\b' + nextStarter + '\\b', 'g');
                                    nextRegex.lastIndex = match.index + 1;

                                    const nextMatch = nextRegex.exec(completeResponse);
                                    if (nextMatch && nextMatch.index < endIndex) {
                                        endIndex = nextMatch.index;
                                    }
                                }

                                // Extract the question
                                const question = completeResponse.substring(match.index, endIndex).trim();
                                questions.push(question);

                                // Update last index
                                lastIndex = endIndex;
                            }
                        }
                    }
                }

                // Ensure we only have 3 questions
                questions = questions.slice(0, 3);

                // If we still don't have 3 questions, just use whatever we have
                console.log("Extracted questions:", questions);

                if (callback) {
                    callback(questions);
                }
            } else {
                console.error('Error generating questions:', xhr.status, xhr.statusText);
                console.error('Response:', xhr.responseText);
                if (callback) {
                    callback([]);
                }
            }
        };

        // Handle network errors
        xhr.onerror = function (event) {
            console.error('Network error during question generation:', event);
            if (callback) {
                callback([]);
            }
        };

        // Handle timeouts
        xhr.ontimeout = function () {
            console.error('Timeout during question generation');
            if (callback) {
                callback([]);
            }
        };

        // Send the request with claude-3.5-haiku model
        const data = JSON.stringify({
            query: prompt,
            model: "claude-3.5-haiku" // Use claude-3.5-haiku specifically for suggestion generation
        });

        console.log("Sending API request with data:", data);
        xhr.send(data);
    } catch (error) {
        console.error("Exception in generateQuestionsFromSelection:", error);
        if (callback) callback([]);
    }
}

// Event listener for text selection
function handleTextSelection(event) {
    try {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && !isOverlayOpen()) {
            console.log("Text selected:", selectedText.substring(0, 50) + (selectedText.length > 50 ? "..." : ""));
            // Get the coordinates for the icon (use end of selection)
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Position the icon near the end of the selection
            const x = rect.right + window.scrollX;
            const y = rect.bottom + window.scrollY;

            // Show the icon and pass the selected text
            showSelectionIcon(x, y, selectedText);
        }
    } catch (error) {
        console.error("Error in handleTextSelection:", error);
    }
}

// Add mouseup event listener for text selection
document.addEventListener('mouseup', handleTextSelection);

// Remove selection icon
function removeSelectionIcon() {
    const icon = document.getElementById(selectionIconId);
    if (icon) {
        console.log("Removing selection icon");
        icon.remove();
    }
}

// Add Tag Button to post front content
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.bottom >= 0 &&
        rect.top <= (window.innerHeight || document.documentElement.clientHeight)
    );
}

function createTagButton(text, content) {
    const btn = document.createElement('button');
    btn.style.width = 'fit-content';
    btn.style.position = 'relative';
    btn.style.padding = '4px 8px';
    btn.style.fontSize = '12px';
    btn.style.border = '1px solid #999';
    btn.style.borderRadius = '9999px'; // Fully rounded button
    btn.style.backgroundColor = '#1A202C'; // Background color similar to bg-M1
    btn.style.color = '#fff'; // White text
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.overflow = 'hidden';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = 9999;

    // Adding an image to the button (optional, you can add your image URL here)
    const img = document.createElement('img');
    img.alt = "Sui";
    img.style.marginRight = '4px'; // Adjust margin between image and text
    img.style.borderRadius = '50%';
    img.style.height = '16px';
    img.style.width = '16px';
    img.style.border = '2px solid #fff';
    img.src = "https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png";
    btn.appendChild(img);

    // Adding text to the button
    const span = document.createElement('span');
    span.style.fontSize = '12px';
    span.style.color = '#fff';
    span.textContent = text;
    btn.appendChild(span);

    // Adding an SVG icon (optional, you can customize this part)
    const svg = document.createElement('svg');
    svg.setAttribute('xmlns', "http://www.w3.org/2000/svg");
    svg.setAttribute('width', "16");
    svg.setAttribute('height', "16");
    svg.setAttribute('viewBox', "0 0 16 16");
    svg.style.marginLeft = '4px';
    svg.style.fill = '#fff';
    const path = document.createElement('path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('d', "M4.571 2.828h-.6v1.2h7.152l-7.547 7.548L3.15 12l.849.848.424-.424 7.547-7.547v7.151h1.2v-8.6a.6.6 0 0 0-.6-.6z");
    path.setAttribute('clip-rule', 'evenodd');
    svg.appendChild(path);
    btn.appendChild(svg);

    btn.onclick = (e) => {
        // Prevent the click from bubbling up to document
        e.stopPropagation();
        createTagOverlay(text, content);
    };

    return btn;
}

function createTagOverlay(text, contentText) {
    let overlay = document.getElementById(overlayTagId);
    if (overlay) {
        // 🔁 If there is an overlay, only update the content
        const title = overlay.querySelector('.overlay-title');
        if (title) {
            title.textContent = text;
        }
        const content = overlay.querySelector('.overlay-content-text');
        if (title) {
            content.textContent = contentText;
        }

        overlay.style.transform = 'translateX(0px)';
        return;
    }

    // 🆕 Create new if not existing
    overlay = document.createElement('div');
    overlay.id = overlayTagId;
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.width = '33vw';
    overlay.style.height = '98vh';
    overlay.style.maxWidth = '69vw';
    overlay.style.minWidth = '520px';
    overlay.style.minHeight = '98vh';
    overlay.style.maxHeight = '98vh';
    overlay.style.background = '#fafafa';
    overlay.style.boxShadow = '0 2px 24px rgba(0,0,0,0.18)';
    overlay.style.zIndex = '999999';
    overlay.style.borderRadius = '12px 0 0 12px';
    overlay.style.border = '1px solid #e4e4e7';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
    overlay.style.transform = 'translateX(0)';

    // Collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '▶'; // hoặc '➔', '→', tuỳ style bạn thích
    collapseBtn.style.color = 'white'; // đảm bảo màu trắng
    collapseBtn.style.fontSize = '18px';
    collapseBtn.style.fontWeight = 'bold';

    collapseBtn.style.position = 'absolute';
    collapseBtn.style.left = '-32px';
    collapseBtn.style.top = '24px';
    collapseBtn.style.width = '32px';
    collapseBtn.style.height = '32px';
    collapseBtn.style.background = '#0f0f0f';
    collapseBtn.style.border = '1px solid #2a2a2a';
    collapseBtn.style.borderRadius = '50%';
    collapseBtn.style.boxShadow = '0 0 6px rgba(100, 100, 255, 0.3)';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.display = 'flex';
    collapseBtn.style.alignItems = 'center';
    collapseBtn.style.justifyContent = 'center';
    collapseBtn.title = 'Collapse';
    collapseBtn.style.transition = 'transform 0.3s ease, box-shadow 0.2s ease';

    collapseBtn.onmouseenter = () => {
        collapseBtn.style.boxShadow = '0 0 10px rgba(140, 140, 255, 0.4)';
    };
    collapseBtn.onmouseleave = () => {
        collapseBtn.style.boxShadow = '0 0 6px rgba(100, 100, 255, 0.3)';
    };
    collapseBtn.onclick = () => {
        const isCollapsed = overlay.style.transform === 'translateX(0px)';
        overlay.style.transform = isCollapsed ? 'translateX(100%)' : 'translateX(0px)';
        collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
        collapseBtn.textContent = isCollapsed ? '◀' : '▶'; // chuyển hướng
    };
    overlay.appendChild(collapseBtn);

    // 📦 Content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.style.flex = '1';
    contentWrapper.style.overflow = 'auto';
    contentWrapper.style.display = 'flex';
    contentWrapper.style.flexDirection = 'column';
    contentWrapper.style.height = '100%';

    // 🏷 Header
    const header = document.createElement('div');
    header.style.padding = '16px 20px';
    header.style.borderBottom = '1px solid #e4e4e7';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';

    // 📝 Title
    const title = document.createElement('div');
    title.className = 'overlay-title';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.textContent = text;
    header.appendChild(title);

    // Header actions container
    const headerActions = document.createElement('div');
    headerActions.style.display = 'flex';
    headerActions.style.gap = '12px';
    headerActions.style.alignItems = 'center';

    /// Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path></svg>';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '5px';
    closeBtn.onclick = () => {
        // Save chat history before closing the overlay
        removeOverlayTag();
    };
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);
    contentWrapper.appendChild(header);

    // 📄 Main Content Text (same as description in image)
    const body = document.createElement('div');
    body.className = 'overlay-content-text';
    body.style.padding = '20px';
    body.style.fontSize = '14px';
    body.style.lineHeight = '1.6';
    body.style.whiteSpace = 'pre-wrap';
    body.style.backgroundColor = '#f5f5f5';
    body.style.borderRadius = '8px';
    body.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.1)';
    body.style.margin = '10px';
    body.style.color = '#333';
    body.textContent = contentText;

    contentWrapper.appendChild(body);
    overlay.appendChild(contentWrapper);
    document.body.appendChild(overlay);
    setupClickOutsideListener();
}

function removeOverlayTag() {
    const overlay = document.getElementById(overlayTagId);
    if (overlay) {
        overlay.remove();
        // Remove the click outside listener when closing the overlay
        removeClickOutsideListener();
    }
}

function removeOldButtons() {
    document.querySelectorAll('.custom-injected-btn').forEach(btn => btn.remove());
}

function getVisiblePosts() {
    removeOldButtons(); // Removes buttons from previous checks

    const posts = document.querySelectorAll('article');
    const visibleContents = [];

    posts.forEach(post => {
        const avatar = post.querySelector('img');
        if (avatar && isInViewport(avatar)) {
            const text = post.innerText?.trim();
            if (!text) return;

            visibleContents.push(text);

            const lines = text.split('\n').filter(line => line.length > 5);
            if (lines.length === 0) return;

            const content = lines[0];
            const timeTag = post.querySelector('time');
            if (!timeTag) return;

            let current = timeTag.parentElement;
            let contentDiv = null;

            while (current && current !== post) {
                const maybeContentDiv = current.querySelector('div[dir="auto"]');
                if (maybeContentDiv) {
                    contentDiv = maybeContentDiv.closest('div');
                    break;
                }
                current = current.parentElement;
            }

            // Check if the button already exists by checking a class
            if (post.querySelector('.custom-injected-btn')) {
                return; // Skip this post if the button has already been added
            }


            if (contentDiv) {
                const contentDivText = contentDiv.innerText.trim();
                const lines = contentDivText.split('\n').filter(line => line.trim().length > 0);

                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.flexWrap = 'wrap';
                btnContainer.style.gap = '6px';
                btnContainer.classList.add('custom-injected-btn-container');

                const maxButtons = Math.min(3, lines.length);
                for (let i = 0; i < maxButtons; i++) {
                    const line = lines[i].trim();
                    const firstTwoWords = line.split(' ').slice(0, 2).join(' ');
                    const btn = createTagButton(firstTwoWords, contentDivText);
                    btn.classList.add('custom-injected-btn');
                    btnContainer.appendChild(btn);
                }

                contentDiv.parentElement.insertBefore(btnContainer, contentDiv);
            }

        }
    });
}

// Scroll listener
let scrollTimeout;
function onScroll() {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        getVisiblePosts();
    }, 300);
}
window.addEventListener('scroll', onScroll);

// MutationObserver
let mutationTimeout;
const observer = new MutationObserver(mutations => {
    const shouldIgnore = mutations.some(m =>
        [...m.addedNodes].some(n => n.classList?.contains('custom-injected-btn'))
    );
    if (shouldIgnore) return;

    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
        getVisiblePosts();
    }, 500);
});
observer.observe(document.body, {
    childList: true,
    subtree: true
});

window.addEventListener('load', () => {
    setTimeout(() => {
        getVisiblePosts();
    }, 1000);
});

window.disableObserver = () => {
    observer.disconnect();
    window.removeEventListener('scroll', onScroll);
    console.log('🛑 Observer & scroll listener disabled.');
};

// Model login
function createLoginModalInsideOverlay() {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;

    if (document.getElementById('login-modal')) return;

    const xIconUrl = chrome.runtime.getURL("x-icon.svg");
    const galxeIconUrl = chrome.runtime.getURL("galxe-icon.png");
    const googleIconUrl = chrome.runtime.getURL("gg-icon.png");

    // Tạo modal
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.style.position = 'absolute';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.width = '400px';
    modal.style.background = 'radial-gradient(circle, #1a1a1a 0%, #000000 90%)';  // nền đen gradient nhẹ
    modal.style.borderRadius = '12px';
    modal.style.padding = '24px';
    modal.style.boxShadow = '0 0 20px rgba(180,180,180,0.3)'; // bóng trắng xám nhẹ
    modal.style.zIndex = '9999';
    modal.style.color = '#ccc'; // chữ xám sáng
    modal.style.fontFamily = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';

    // Ngăn sự kiện click lan ra dimLayer
    modal.onclick = (e) => {
        e.stopPropagation();
    };

    // Nút đóng modal
    const modalCloseBtn = document.createElement('button');
    modalCloseBtn.textContent = '×';
    modalCloseBtn.style.position = 'absolute';
    modalCloseBtn.style.top = '12px';
    modalCloseBtn.style.right = '12px';
    modalCloseBtn.style.fontSize = '24px';
    modalCloseBtn.style.border = 'none';
    modalCloseBtn.style.background = 'none';
    modalCloseBtn.style.color = '#bbb'; // xám nhạt
    modalCloseBtn.style.cursor = 'pointer';
    modalCloseBtn.style.transition = 'color 0.25s ease';
    modalCloseBtn.onmouseenter = () => {
        modalCloseBtn.style.color = '#fff'; // trắng sáng hơn khi hover
    };
    modalCloseBtn.onmouseleave = () => {
        modalCloseBtn.style.color = '#bbb';
    };
    modalCloseBtn.onclick = (e) => {
        e.stopPropagation();
        modal.remove();
        dimLayer.remove();
    };
    modal.appendChild(modalCloseBtn);

    // Tiêu đề
    const title = document.createElement('h2');
    title.innerHTML = `<span style="color:#bbb">Log in</span> to unlock <strong style="color:#eee">FREE</strong> AI insights`;
    title.style.marginBottom = '20px';
    title.style.fontWeight = '600';
    modal.appendChild(title);

    // Nút "Log in with X"
    const loginWithXBtn = document.createElement('button');
    loginWithXBtn.style.display = 'flex';
    loginWithXBtn.style.alignItems = 'center';
    loginWithXBtn.style.justifyContent = 'center';
    loginWithXBtn.style.gap = '8px';
    loginWithXBtn.style.backgroundColor = '#fff';      // nền trắng
    loginWithXBtn.style.color = '#111';                // chữ đen đậm
    loginWithXBtn.style.padding = '12px';
    loginWithXBtn.style.width = '100%';
    loginWithXBtn.style.border = '1px solid #ccc';    // viền xám nhạt
    loginWithXBtn.style.borderRadius = '8px';
    loginWithXBtn.style.fontSize = '15px';
    loginWithXBtn.style.fontWeight = '500';
    loginWithXBtn.style.cursor = 'pointer';
    loginWithXBtn.style.transition = 'background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease';
    loginWithXBtn.onmouseenter = () => {
        loginWithXBtn.style.backgroundColor = '#f0f0f0';   // hover sáng hơn
        loginWithXBtn.style.borderColor = '#999';
        loginWithXBtn.style.color = '#000';
    };
    loginWithXBtn.onmouseleave = () => {
        loginWithXBtn.style.backgroundColor = '#fff';
        loginWithXBtn.style.borderColor = '#ccc';
        loginWithXBtn.style.color = '#111';
    };

    // Icon + text
    const xIcon = document.createElement('img');
    xIcon.src = xIconUrl;
    xIcon.style.height = '20px';
    xIcon.style.filter = 'none';  // bỏ filter trắng để icon gốc hiện đúng màu
    loginWithXBtn.appendChild(document.createTextNode('Log in with '));
    loginWithXBtn.appendChild(xIcon);

    modal.appendChild(loginWithXBtn);


    // OR divider
    const orDiv = document.createElement('div');
    orDiv.textContent = 'OR';
    orDiv.style.textAlign = 'center';
    orDiv.style.margin = '20px 0';
    orDiv.style.color = '#666'; // xám đậm nhạt
    orDiv.style.fontWeight = '600';
    modal.appendChild(orDiv);

    // Icon row (Galxe + Google)
    const iconRow = document.createElement('div');
    iconRow.style.display = 'flex';
    iconRow.style.justifyContent = 'center';
    iconRow.style.gap = '16px';

    // Galxe
    const galxeIcon = document.createElement('img');
    galxeIcon.src = galxeIconUrl;
    galxeIcon.style.height = '32px';
    galxeIcon.style.cursor = 'pointer';
    galxeIcon.style.filter = 'brightness(0) invert(1)'; // icon trắng
    iconRow.appendChild(galxeIcon);

    // Google
    const googleIcon = document.createElement('img');
    googleIcon.src = googleIconUrl;
    googleIcon.style.height = '32px';
    googleIcon.style.cursor = 'pointer';
    googleIcon.style.filter = 'brightness(0) invert(1)'; // icon trắng
    iconRow.appendChild(googleIcon);

    modal.appendChild(iconRow);

    // Terms text
    const terms = document.createElement('p');
    terms.style.fontSize = '12px';
    terms.style.marginTop = '24px';
    terms.style.textAlign = 'center';
    terms.style.color = '#666'; // xám đậm nhạt
    terms.innerHTML = `By signing in, you agree to the <a href="#" style="color:#8b8b8b; text-decoration: underline;">Terms of Service</a> and <a href="#" style="color:#8b8b8b; text-decoration: underline;">Privacy Policy</a>.`;
    modal.appendChild(terms);

    // Tạo lớp nền mờ phủ overlay
    const dimLayer = document.createElement('div');
    dimLayer.id = 'overlay-dim-layer';
    dimLayer.style.position = 'absolute';
    dimLayer.style.top = '0';
    dimLayer.style.left = '0';
    dimLayer.style.width = '100%';
    dimLayer.style.height = '100%';
    dimLayer.style.backgroundColor = 'rgba(20, 20, 20, 0.7)'; // nền mờ tối hơn
    dimLayer.style.zIndex = '9998';

    overlay.appendChild(dimLayer);
    overlay.appendChild(modal);
}
