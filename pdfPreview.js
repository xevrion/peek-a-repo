// pdfPreview.js - PDF rendering logic

class PDFPreviewHandler {
  constructor() {
    this.isInitialized = false;
    this.currentTask = null;
  }

  async init() {
    if (this.isInitialized) return;

    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 
        chrome.runtime.getURL('lib/pdf.worker.min.js');
      this.isInitialized = true;
    } else {
      throw new Error('PDF.js library not loaded');
    }
  }

  isPDFLink(url) {
    if (!url) return false;
    
    // Check for .pdf extension
    if (url.toLowerCase().endsWith('.pdf')) return true;
    
    // Check GitHub blob URLs that might be PDFs
    const pdfPattern = /github\.com\/[^/]+\/[^/]+\/blob\/[^?]+\.pdf/i;
    return pdfPattern.test(url);
  }

  async fetchPDFData(url) {
    return new Promise((resolve, reject) => {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        reject(new Error('Extension context invalidated'));
        return;
      }

      chrome.runtime.sendMessage(
        { action: 'fetchPDF', url },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Failed to fetch PDF'));
          }
        }
      );
    });
  }

  async renderPDFPreview(base64Data, container, options = {}) {
    const {
      maxPages = 1,
      scale = 1.0,
      maxWidth = 400
    } = options;

    await this.init();

    // Cancel any existing render task
    if (this.currentTask) {
      this.currentTask.cancel?.();
    }

    // Decode base64 to Uint8Array
    const pdfData = this.base64ToUint8Array(base64Data);

    // Load the PDF
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    this.currentTask = loadingTask;

    try {
      const pdf = await loadingTask.promise;
      
      // Clear container
      container.innerHTML = '';

      // Add page count info
      const info = document.createElement('div');
      info.className = 'pdf-info';
      info.textContent = `PDF Document - ${pdf.numPages} page(s)`;
      container.appendChild(info);

      // Render pages
      const pagesToRender = Math.min(maxPages, pdf.numPages);
      
      for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
        const page = await pdf.getPage(pageNum);
        
        // Calculate scale to fit maxWidth
        const viewport = page.getViewport({ scale: 1 });
        const adjustedScale = Math.min(scale, maxWidth / viewport.width);
        const scaledViewport = page.getViewport({ scale: adjustedScale });

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        const context = canvas.getContext('2d');

        // Render page
        await page.render({
          canvasContext: context,
          viewport: scaledViewport
        }).promise;

        container.appendChild(canvas);

        // Add page number if multiple pages
        if (pagesToRender > 1) {
          const pageLabel = document.createElement('div');
          pageLabel.className = 'pdf-page-label';
          pageLabel.textContent = `Page ${pageNum}`;
          container.appendChild(pageLabel);
        }
      }

      // Show "more pages" indicator
      if (pdf.numPages > maxPages) {
        const moreIndicator = document.createElement('div');
        moreIndicator.className = 'pdf-more-pages';
        moreIndicator.textContent = `+ ${pdf.numPages - maxPages} more page(s)`;
        container.appendChild(moreIndicator);
      }

    } catch (error) {
      if (error.name === 'RenderingCancelledException') {
        return; // Silently ignore cancelled renders
      }
      throw error;
    }
  }

  base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  cancel() {
    if (this.currentTask) {
      this.currentTask.cancel?.();
      this.currentTask = null;
    }
  }
}

// Export for use in content script
window.PDFPreviewHandler = PDFPreviewHandler;