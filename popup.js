// Popup script for interactivity

document.addEventListener('DOMContentLoaded', () => {
    // Theme switching functionality
    const darkThemeClass = 'dark-theme';
    const themeToggle = document.getElementById('theme-toggle');

    // Check for saved theme preference using Chrome storage API
    if (chrome && chrome.storage) {
        chrome.storage.sync.get(['theme'], function (result) {
            if (result.theme === 'dark') {
                document.body.classList.add(darkThemeClass);
                updateThemeIcon(true);
            }
        });
    } else {
        // Fallback to localStorage for development
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add(darkThemeClass);
            updateThemeIcon(true);
        }
    }

    // Theme toggle functionality
    themeToggle.addEventListener('click', () => {
        const isDarkTheme = document.body.classList.toggle(darkThemeClass);
        updateThemeIcon(isDarkTheme);

        // Save preference to Chrome storage if available
        if (chrome && chrome.storage) {
            chrome.storage.sync.set({ theme: isDarkTheme ? 'dark' : 'light' });
        } else {
            // Fallback to localStorage for development
            localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
        }
    });

    function updateThemeIcon(isDarkTheme) {
        // Update icon based on current theme
        if (isDarkTheme) {
            themeToggle.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"></path>
                    <path d="M12 3v1"></path>
                    <path d="M12 20v1"></path>
                    <path d="M3 12h1"></path>
                    <path d="M20 12h1"></path>
                    <path d="M5.6 5.6l.7 .7"></path>
                    <path d="M18.4 5.6l-.7 .7"></path>
                    <path d="M17.7 17.7l.7 .7"></path>
                    <path d="M6.3 17.7l-.7 .7"></path>
                </svg>
            `;
        } else {
            themeToggle.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>
                </svg>
            `;
        }
    }

    // Function to load SVG content
    async function loadSvgIcon(buttonId, svgPath) {
        try {
            const response = await fetch(svgPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const svgText = await response.text();
            const button = document.getElementById(buttonId);
            if (button) {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                const svgElement = svgDoc.querySelector('svg');
                if (svgElement) {
                    // Clear existing content (placeholder SVG)
                    button.innerHTML = '';
                    // Add classes for styling/sizing
                    svgElement.classList.add('h-[26px]', 'w-[26px]');
                    button.appendChild(svgElement);
                } else {
                    console.log('Could not find SVG element within the fetched file.');
                }
            } else {
                console.log(`Button with ID '${buttonId}' not found.`);
            }
        } catch (error) {
            console.log('Error loading SVG:', error);
        }
    }

    // Load the logo SVG
    loadSvgIcon('logo-button', 'icon.svg');

    // Get references to elements needed across the script
    const logoButton = document.getElementById('logo-button');
    const chatContainer = document.getElementById('chat-container');
    const featuresContainer = document.getElementById('features-container');
    const chatInput = document.querySelector('.chat-input input');
    const sendButton = document.querySelector('.send-button');
    const placeholder = document.querySelector('.placeholder');
    const tokenAnalysisLink = document.getElementById('token-analysis-link');
    const yesButton = document.querySelector('.yes-button');
    const selectedWebModelText = document.getElementById('selected-web-model');
    const selectedGptModelText = document.getElementById('selected-gpt-model');

    // Add click listener to logo button for reset
    logoButton.addEventListener('click', () => {
        // Reset chat and show features
        resetChat();
    });

    // Add click event listener for the token analysis link
    if (tokenAnalysisLink) {
        tokenAnalysisLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Token analysis report clicked');
            // Could implement navigation to the report page
        });
    }

    // Add click event listener for the yes button
    if (yesButton) {
        yesButton.addEventListener('click', () => {
            console.log('Yes button clicked');
            // Could implement website report generation functionality
        });
    }

    // Add click event listeners to feature items
    const featureItems = document.querySelectorAll('.feature-item');

    // Dummy chat flows for each feature
    const featureChatDummies = {
        'Chat with this Webpage': [
            { sender: 'user', message: 'Can you analyze the performance of Berachain token?' },
            { sender: 'assistant', message: 'Sure! Here are some highlights of Berachain:' },
            { sender: 'assistant', message: '- BeaconKit modular framework\n- EVM-identical environment\n- Rich API ecosystem\n- Multiple RPC endpoints\n- Support\n- Active developer community\n- Regular hackathons\n- Technical documentation\n- Direct team access' },
            { sender: 'assistant', message: 'For the technical goons out there: this is what peak blockchain performance looks like. No cap.' },
            { sender: 'assistant', message: 'Do you want to generate a website report for this research?' },
            { sender: 'user', message: 'Yes' },
            { sender: 'assistant', message: 'Token Analysis Report:\n[Click here to view the detailed token analysis report](#)' }
        ],
        'Chatbots': [
            { sender: 'user', message: 'Give me a summary of the BERA token.' },
            { sender: 'assistant', message: 'Token Name: Berachain (BERA)\nMarket Cap: $1,200,000,000\n24h Volume: $45,000,000\nCirculating Supply: 100,000,000 BERA\nAll Time High: $15.20\nAll Time Low: $0.80' },
            { sender: 'assistant', message: 'Summary: Berachain is a modular blockchain platform with a strong developer community and robust technical documentation. It supports EVM compatibility and offers multiple RPC endpoints for seamless integration.' },
            { sender: 'user', message: 'Can you check the website health?' },
            { sender: 'assistant', message: 'Website Health: Excellent\nSecurity: No vulnerabilities detected\nSEO Score: 92/100\nSuggestions:\n- Improve mobile responsiveness\n- Add more technical documentation\n- Increase community engagement' },
            { sender: 'assistant', message: 'Would you like to generate a full website report or view the token analysis?' }
        ],
        'Chat with your Documents': [
            { sender: 'user', message: 'Can you extract key points from this whitepaper?' },
            { sender: 'assistant', message: 'Certainly! Here are the key points from the document:\n- Modular blockchain architecture\n- EVM compatibility\n- Developer-friendly APIs\n- Active community support' },
            { sender: 'assistant', message: 'Would you like a detailed summary or a technical breakdown?' }
        ],
        'Generate Images': [
            { sender: 'user', message: 'Generate an infographic for Berachain ecosystem.' },
            { sender: 'assistant', message: 'Here is a generated infographic for the Berachain ecosystem (image preview dummy).' },
            { sender: 'assistant', message: '[Download Infographic](#)' }
        ],
        'Code Interpreter': [
            { sender: 'user', message: 'Can you analyze this CSV of token prices?' },
            { sender: 'assistant', message: 'Sure! I have detected trends and anomalies in the token price data. Would you like a chart or a statistical summary?' },
            { sender: 'user', message: 'Show me a chart.' },
            { sender: 'assistant', message: '[Chart preview dummy]\nThe chart above shows the price movement of BERA over the last 30 days.' }
        ]
    };

    featureItems.forEach(item => {
        item.addEventListener('click', () => {
            // Get feature name
            const featureName = item.querySelector('.text-lg').textContent;
            
            // Check if we can use overlay in the current tab
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]?.id) {
                    // Send command to open overlay with information about the selected feature
                    chrome.tabs.sendMessage(tabs[0].id, { 
                        toggleOverlay: true,
                        featureName: featureName
                    });
                    
                    // Close popup after sending the information
                    window.close();
                } else {
                    // If we can't send a message, display in popup
                    switchToChat();
                    
                    // Clear chat before adding dummy messages
                    chatContainer.innerHTML = '';
                    // Add dummy chat flow for this feature
                    const chatFlow = featureChatDummies[featureName];
                    if (chatFlow) {
                        let delay = 0;
                        chatFlow.forEach((msg, idx) => {
                            setTimeout(() => {
                                addMessage(msg.message, msg.sender);
                            }, delay);
                            delay += 700;
                        });
                    } else {
                        // Fallback: just show welcome message
                        setTimeout(() => {
                            addMessage(`Welcome to ${featureName}. How can I help you today?`, 'assistant');
                        }, 400);
                    }
                }
            });
        });
    });

    function switchToChat() {
        chatContainer.style.display = 'flex';
        featuresContainer.style.display = 'none';
    }

    // Variables to store current model selections
    let currentWebModel = 'Turbo';
    let currentGptModel = 'GPT 4o Mini';

    // Dropdown functionality for Web Access model
    const accessWebButton = document.getElementById('access-web-button');
    const webModelDropdown = document.getElementById('web-model-dropdown');
    const webModelItems = webModelDropdown.querySelectorAll('.dropdown-item');

    accessWebButton.addEventListener('click', () => {
        webModelDropdown.classList.toggle('show');
        // Hide the other dropdown if it's open
        gptModelDropdown.classList.remove('show');
    });

    webModelItems.forEach(item => {
        item.addEventListener('click', () => {
            const selectedModel = item.getAttribute('data-value');
            selectedWebModelText.textContent = selectedModel;
            currentWebModel = selectedModel;
            webModelDropdown.classList.remove('show');
        });
    });

    // Dropdown functionality for GPT model
    const gptModelButton = document.getElementById('gpt-model-button');
    const gptModelDropdown = document.getElementById('gpt-model-dropdown');
    const gptModelItems = gptModelDropdown.querySelectorAll('.dropdown-item');

    gptModelButton.addEventListener('click', () => {
        gptModelDropdown.classList.toggle('show');
        // Hide the other dropdown if it's open
        webModelDropdown.classList.remove('show');
    });

    gptModelItems.forEach(item => {
        item.addEventListener('click', () => {
            const selectedModel = item.getAttribute('data-value');
            selectedGptModelText.textContent = selectedModel;
            currentGptModel = selectedModel;
            gptModelDropdown.classList.remove('show');
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!gptModelButton.contains(e.target) && !gptModelDropdown.contains(e.target)) {
            gptModelDropdown.classList.remove('show');
        }
        if (!accessWebButton.contains(e.target) && !webModelDropdown.contains(e.target)) {
            webModelDropdown.classList.remove('show');
        }
    });

    // Text input handling
    chatInput.addEventListener('focus', () => {
        placeholder.style.display = 'none';
    });

    chatInput.addEventListener('blur', () => {
        if (!chatInput.value.trim()) {
            placeholder.style.display = 'block';
        }
    });

    chatInput.addEventListener('input', () => {
        if (chatInput.value.trim()) {
            sendButton.disabled = false;
            placeholder.style.display = 'none';
        } else {
            sendButton.disabled = true;
            placeholder.style.display = 'block';
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            sendMessage();
        }
    });

    sendButton.addEventListener('click', () => {
        if (chatInput.value.trim()) {
            sendMessage();
        }
    });

    function resetChat() {
        // Hide chat container and show features
        chatContainer.style.display = 'none';
        featuresContainer.style.display = 'grid';
        // Clear the chat container
        chatContainer.innerHTML = '';
    }

    function updateLightning() {
        // Mock implementation: Decrement lightning count with each message
        const lightningCount = document.querySelector('.lightning-count');
        let count = parseInt(lightningCount.textContent);
        if (count > 0) {
            count--;
            lightningCount.textContent = count;
        }
    }

    function sendMessage() {
        // Add user message
        const userMessage = chatInput.value.trim();
        addMessage(userMessage, 'user');

        // Clear input
        chatInput.value = '';
        sendButton.disabled = true;
        placeholder.style.display = 'block';

        // Generate a response based on selected model
        setTimeout(() => {
            const model = currentGptModel;
            generateDummyResponse(userMessage, model);
            updateLightning();
        }, 500);
    }

    function addMessage(message, sender) {
        // Create message element
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message');
        messageEl.classList.add(sender === 'user' ? 'user-message' : 'assistant-message');

        // Set content
        messageEl.textContent = message;

        // Handle links in messages
        messageEl.innerHTML = messageEl.innerHTML.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // Add to container
        chatContainer.appendChild(messageEl);
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Check if overlay is already open in the current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { checkOverlayStatus: true }, function(response) {
                if (response && response.isOpen) {
                    // If overlay is open, show chat interface in popup
                    switchToChat();
                    
                    // Show welcome message
                    setTimeout(() => {
                        addMessage("Overlay mode is active. You can continue your conversation here.", 'assistant');
                    }, 400);
                }
            });
        }
    });

    function generateDummyResponse(message, model) {
        if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
            addMessage(`Hello there! I'm your Cybera Clone assistant powered by ${model}. How can I help you today?`, 'assistant');
        } else if (message.toLowerCase().includes('thank')) {
            addMessage("You're welcome! Anything else I can assist you with?", 'assistant');
        } else if (message.toLowerCase().includes('report')) {
            addMessage("I've generated a detailed report for you. Would you like to see the full analysis?", 'assistant');
        } else if (message.toLowerCase().includes('token') || message.toLowerCase().includes('price')) {
            addMessage("Based on my analysis, the token has shown a 15% increase over the past week with strong community support. The trading volume has remained steady with minor fluctuations.", 'assistant');
        } else if (message.toLowerCase().includes('code') || message.toLowerCase().includes('programming')) {
            addMessage("Here's a code snippet that might help:\n```javascript\nconst analyzeToken = async (tokenId) => {\n  const data = await fetchTokenData(tokenId);\n  return processAnalytics(data);\n};\n```\nWould you like me to explain how it works?", 'assistant');
        } else {
            // Default response
            addMessage(`I've processed your request with ${model}. Is there anything specific you'd like to know about this topic?`, 'assistant');
        }
    }
}); 