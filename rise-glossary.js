/**
 * RISE Glossary Library
 * A JavaScript library for adding interactive glossary functionality to Articulate RISE courses
 * 
 * Features:
 * - Automatic term detection and highlighting
 * - Responsive popup tooltips with definitions, images, and links
 * - MutationObserver for dynamic content
 * - Accessibility support (ARIA, keyboard navigation, screen readers)
 * - Mobile-friendly touch interactions
 * - Prevents reprocessing of the same content
 * - Smooth animations and transitions
 */

class RiseGlossary {
    constructor(options = {}) {
        this.options = {
            dataUrl: options.dataUrl || 'glossary-data.json',
            highlightColor: options.highlightColor || '#000000',
            popupPosition: options.popupPosition || 'auto', // auto, top, bottom, left, right
            animationDuration: options.animationDuration || 300,
            mobileBreakpoint: options.mobileBreakpoint || 768,
            caseSensitive: options.caseSensitive || false,
            excludeSelectors: options.excludeSelectors || [
                'script', 'style', 'code', 'pre', '.glossary-term', 
                '.glossary-popup', '[data-glossary-processed]'
            ],
            enableKeyboard: options.enableKeyboard !== false,
            enableTouch: options.enableTouch !== false,
            enableHover: options.enableHover !== false,
            debugMode: options.debugMode || false,
            ...options
        };

        this.terms = [];
        this.processedNodes = new WeakSet();
        this.activePopup = null;
        this.isTouch = false;
        this.popupId = 0;
        
        this.init();
    }

    async init() {
        try {
            await this.loadTerms();
            this.setupStyles();
            this.setupEventListeners();
            this.setupMutationObserver();
            this.processExistingContent();
            this.log('RISE Glossary initialized successfully');
        } catch (error) {
            console.error('Failed to initialize RISE Glossary:', error);
        }
    }

    async loadTerms() {
        try {
            const response = await fetch(this.options.dataUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // Filter enabled terms and sort by length (longest first for better matching)
            this.terms = (data.terms || [])
                .filter(term => term.enabled !== false)
                .sort((a, b) => b.word.length - a.word.length);
                
            this.log(`Loaded ${this.terms.length} terms`);
        } catch (error) {
            throw new Error(`Failed to load glossary data: ${error.message}`);
        }
    }

    setupStyles() {
        const styleId = 'rise-glossary-styles';
        if (document.getElementById(styleId)) return;

        const styles = `
            .glossary-term {
                border-bottom: 1px solid ${this.options.highlightColor};
                cursor: pointer;
                transition: all 0.2s ease;
                text-decoration: none;
                color: inherit;
                position: relative;
                z-index: 1;
            }

            .glossary-term:hover {
                background: ${this.options.highlightColor}33;
                color: ${this.options.highlightColor};
            }

            .glossary-term:focus {
                outline: 2px solid ${this.options.highlightColor};
                outline-offset: 2px;
                border-radius: 2px;
            }

            .glossary-popup {
                position: absolute;
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                padding: 20px;
                max-width: 350px;
                min-width: 250px;
                z-index: 10000;
                opacity: 0;
                transform: translateY(10px) scale(0.95);
                transition: all ${this.options.animationDuration}ms ease;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.5;
                color: #333;
                backdrop-filter: blur(10px);
            }

            .glossary-popup.active {
                opacity: 1;
                transform: translateY(0) scale(1);
            }



            .glossary-popup-word {
                font-weight: bold;
                color: ${this.options.highlightColor};
                margin-bottom: 8px;
                font-size: 16px;
            }

            .glossary-popup-definition {
                margin-bottom: 12px;
                color: #555;
            }

            .glossary-popup-image {
                width: 100%;
                max-height: 150px;
                object-fit: cover;
                border-radius: 8px;
                margin-bottom: 12px;
            }

            .glossary-popup-link {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                color: ${this.options.highlightColor};
                text-decoration: none;
                font-weight: 500;
                padding: 6px 12px;
                border: 1px solid ${this.options.highlightColor}33;
                border-radius: 6px;
                transition: all 0.2s ease;
                font-size: 13px;
            }

            .glossary-popup-link:hover {
                background: ${this.options.highlightColor}11;
                text-decoration: none;
            }

            .glossary-popup-close {
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #999;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s ease;
            }

            .glossary-popup-close:hover {
                background: #f5f5f5;
                color: #666;
            }

            .glossary-popup-close:focus {
                outline: 0.5px solid ${this.options.highlightColor};
                outline-offset: 1px;
            }

            @media (max-width: ${this.options.mobileBreakpoint}px) {
                .glossary-popup {
                    max-width: calc(100vw - 20px);
                    max-height: calc(100vh - 100px);
                    overflow-y: auto;
                }

                .glossary-term {
                    -webkit-tap-highlight-color: transparent;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .glossary-term,
                .glossary-popup,
                .glossary-popup-link,
                .glossary-popup-close {
                    transition: none;
                }
            }

            /* Screen reader only content */
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.id = styleId;
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    setupEventListeners() {
        // Touch detection
        document.addEventListener('touchstart', () => {
            this.isTouch = true;
        }, { passive: true });

        // Global click handler for closing popups
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.glossary-popup') && !e.target.closest('.glossary-term')) {
                this.hidePopup();
            }
        });

        // Global keyboard handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hidePopup();
            }
        });

        // Window resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.activePopup) {
                    this.positionPopup(this.activePopup.trigger, this.activePopup.element);
                }
            }, 100);
        });
    }

    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            shouldProcess = true;
                        }
                    });
                }
            });

            if (shouldProcess) {
                // Debounce processing to avoid excessive calls
                clearTimeout(this.processingTimeout);
                this.processingTimeout = setTimeout(() => {
                    this.processExistingContent();
                }, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.log('MutationObserver setup complete');
    }

    processExistingContent() {
        const startTime = performance.now();
        
        // Find all text nodes that haven't been processed
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip if already processed
                    if (this.processedNodes.has(node)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if parent matches exclude selectors
                    const parent = node.parentElement;
                    if (!parent || this.shouldExcludeElement(parent)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if text is too short or only whitespace
                    if (!node.textContent.trim() || node.textContent.trim().length < 2) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        this.log(`Processing ${textNodes.length} text nodes`);
        
        textNodes.forEach(textNode => {
            this.processTextNode(textNode);
        });

        const endTime = performance.now();
        this.log(`Content processing completed in ${(endTime - startTime).toFixed(2)}ms`);
    }

    shouldExcludeElement(element) {
        if (!element) return true;
        return this.options.excludeSelectors.some(selector => {
            try {
                return element.matches(selector) || element.closest(selector);
            } catch (e) {
                return false;
            }
        });
    }

    processTextNode(textNode) {
        if (this.processedNodes.has(textNode)) return;
        
        let content = textNode.textContent;
        let hasMatches = false;
        const fragments = [];

        // Sort terms by length (longest first) to avoid partial matches
        const sortedTerms = [...this.terms];
        
        for (const term of sortedTerms) {
            const flags = term.caseSensitive ? 'g' : 'gi';
            const escapedWord = this.escapeRegExp(term.word);
            const regex = new RegExp(`\\b${escapedWord}\\b`, flags);
            
            if (regex.test(content)) {
                hasMatches = true;
                content = content.replace(regex, (match) => {
                    return `<span class="glossary-term-placeholder" data-term-id="${term.id}">${match}</span>`;
                });
            }
        }

        if (hasMatches) {
            // Create a temporary container to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;
            
            // Replace placeholders with actual glossary terms
            const placeholders = tempDiv.querySelectorAll('.glossary-term-placeholder');
            placeholders.forEach(placeholder => {
                const termId = placeholder.dataset.termId;
                const term = this.terms.find(t => t.id === termId);
                if (term) {
                    const glossaryElement = this.createGlossaryElement(term, placeholder.textContent);
                    placeholder.replaceWith(glossaryElement);
                }
            });
            
            // Replace the text node with the new content
            const parent = textNode.parentNode;
            const fragment = document.createDocumentFragment();
            
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            
            parent.replaceChild(fragment, textNode);
            parent.setAttribute('data-glossary-processed', 'true');
        }
        
        this.processedNodes.add(textNode);
    }

    createGlossaryElement(term, matchedText) {
        const element = document.createElement('span');
        element.className = 'glossary-term';
        element.textContent = matchedText;
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-describedby', `glossary-popup-${term.id}`);
        element.setAttribute('aria-label', `${matchedText}: ${term.definition}`);
        element.dataset.termId = term.id;

        // Event listeners
        if (this.options.enableHover && !this.isTouch) {
            element.addEventListener('mouseenter', (e) => {
                this.showPopup(e.currentTarget, term);
            });
            
            element.addEventListener('mouseleave', (e) => {
                // Delay hiding to allow moving to popup
                setTimeout(() => {
                    if (!this.activePopup?.element?.matches(':hover') && 
                        !e.currentTarget?.matches(':hover')) {
                        this.hidePopup();
                    }
                }, 100);
            });
        }

        if (this.options.enableTouch || this.options.enableKeyboard) {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.activePopup && this.activePopup.trigger === e.currentTarget) {
                    this.hidePopup();
                } else {
                    this.showPopup(e.currentTarget, term);
                }
            });
        }

        if (this.options.enableKeyboard) {
            element.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.showPopup(e.currentTarget, term);
                }
            });
        }

        return element;
    }

    showPopup(triggerElement, term) {
        // Hide existing popup
        this.hidePopup();

        const popup = this.createPopup(term);
        document.body.appendChild(popup);
        
        // Store reference
        this.activePopup = {
            element: popup,
            trigger: triggerElement,
            term: term
        };

        // Position and show
        this.positionPopup(triggerElement, popup);
        
        // Trigger animation
        requestAnimationFrame(() => {
            popup.classList.add('active');
        });

        // Add popup event listeners
        this.setupPopupEventListeners(popup);

        // Announce to screen readers
        this.announceToScreenReader(`Glossary definition for ${term.word}: ${term.definition}`);
        
        this.log(`Popup shown for term: ${term.word}`);
    }

    createPopup(term) {
        const popup = document.createElement('div');
        popup.className = 'glossary-popup';
        popup.id = `glossary-popup-${term.id}`;
        popup.setAttribute('role', 'tooltip');
        popup.setAttribute('aria-live', 'polite');

        let content = `
            <button class="glossary-popup-close" aria-label="Close definition" title="Close">×</button>
            <div class="glossary-popup-word">${this.escapeHtml(term.word)}</div>
            <div class="glossary-popup-definition">${this.escapeHtml(term.definition)}</div>
        `;

        if (term.image) {
            content += `<img src="${this.escapeHtml(term.image)}" alt="${this.escapeHtml(term.word)}" class="glossary-popup-image" loading="lazy">`;
        }

        if (term.link) {
            content += `
                <a href="${this.escapeHtml(term.link)}" target="_blank" rel="noopener noreferrer" class="glossary-popup-link">
                    Learn more
                    <span aria-hidden="true">↗</span>
                    <span class="sr-only">(opens in new window)</span>
                </a>
            `;
        }

        popup.innerHTML = content;
        return popup;
    }

    setupPopupEventListeners(popup) {
        // Close button
        const closeBtn = popup.querySelector('.glossary-popup-close');
        closeBtn.addEventListener('click', () => {
            this.hidePopup();
        });

        // Hover to keep popup open
        popup.addEventListener('mouseenter', () => {
            clearTimeout(this.hideTimeout);
        });

        popup.addEventListener('mouseleave', () => {
            if (!this.isTouch) {
                this.hideTimeout = setTimeout(() => {
                    this.hidePopup();
                }, 100);
            }
        });

        // Keyboard navigation
        popup.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hidePopup();
                this.activePopup?.trigger.focus();
            }
        });

        // Focus management for accessibility
        const focusableElements = popup.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    positionPopup(triggerElement, popup) {
        const triggerRect = triggerElement.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollX = window.pageXOffset;
        const scrollY = window.pageYOffset;

        let position = this.options.popupPosition;
        let top, left;

        // Auto-detect best position
        if (position === 'auto') {
            const spaceAbove = triggerRect.top;
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceLeft = triggerRect.left;
            const spaceRight = viewportWidth - triggerRect.right;

            if (spaceBelow >= popupRect.height + 10) {
                position = 'bottom';
            } else if (spaceAbove >= popupRect.height + 10) {
                position = 'top';
            } else if (spaceRight >= popupRect.width + 10) {
                position = 'right';
            } else if (spaceLeft >= popupRect.width + 10) {
                position = 'left';
            } else {
                position = 'bottom'; // Default fallback
            }
        }

        // Position calculation
        switch (position) {
            case 'top':
                top = triggerRect.top + scrollY - popupRect.height - 10;
                left = triggerRect.left + scrollX + (triggerRect.width / 2) - (popupRect.width / 2);
                break;
            case 'bottom':
                top = triggerRect.bottom + scrollY + 10;
                left = triggerRect.left + scrollX + (triggerRect.width / 2) - (popupRect.width / 2);
                break;
            case 'left':
                top = triggerRect.top + scrollY + (triggerRect.height / 2) - (popupRect.height / 2);
                left = triggerRect.left + scrollX - popupRect.width - 10;
                break;
            case 'right':
                top = triggerRect.top + scrollY + (triggerRect.height / 2) - (popupRect.height / 2);
                left = triggerRect.right + scrollX + 10;
                break;
        }

        // Viewport boundary checks
        if (left < 10) left = 10;
        if (left + popupRect.width > viewportWidth - 10) {
            left = viewportWidth - popupRect.width - 10;
        }
        if (top < 10) top = 10;
        if (top + popupRect.height > viewportHeight + scrollY - 10) {
            top = viewportHeight + scrollY - popupRect.height - 10;
        }

        popup.style.position = 'absolute';
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        popup.classList.add(`position-${position}`);
    }

    hidePopup() {
        if (!this.activePopup) return;

        const popup = this.activePopup.element;
        popup.classList.remove('active');

        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, this.options.animationDuration);

        this.activePopup = null;
        clearTimeout(this.hideTimeout);
        
        this.log('Popup hidden');
    }

    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    log(message) {
        if (this.options.debugMode) {
            console.log(`[RISE Glossary] ${message}`);
        }
    }

    // Public API methods
    refresh() {
        this.processExistingContent();
    }

    destroy() {
        this.hidePopup();
        
        // Remove all glossary terms
        document.querySelectorAll('.glossary-term').forEach(term => {
            const parent = term.parentNode;
            parent.replaceChild(document.createTextNode(term.textContent), term);
            parent.normalize();
        });

        // Remove styles
        const styles = document.getElementById('rise-glossary-styles');
        if (styles) {
            styles.remove();
        }

        this.log('RISE Glossary destroyed');
    }

    updateTerms(newTerms) {
        this.terms = newTerms
            .filter(term => term.enabled !== false)
            .sort((a, b) => b.word.length - a.word.length);
        this.processedNodes = new WeakSet();
        this.refresh();
        this.log(`Updated with ${this.terms.length} terms`);
    }
}

// Auto-initialization if data-auto-init attribute is present
document.addEventListener('DOMContentLoaded', () => {
    const autoInit = document.querySelector('script[data-auto-init="true"]');
    if (autoInit) {
        const options = {};
        
        // Read options from data attributes
        Object.keys(autoInit.dataset).forEach(key => {
            if (key !== 'autoInit') {
                const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                let value = autoInit.dataset[key];
                
                // Try to parse as JSON for complex values
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // Keep as string if not valid JSON
                }
                
                options[camelKey] = value;
            }
        });
        
        window.riseGlossary = new RiseGlossary(options);
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RiseGlossary;
}

// Global assignment for browser usage
if (typeof window !== 'undefined') {
    window.RiseGlossary = RiseGlossary;
}
