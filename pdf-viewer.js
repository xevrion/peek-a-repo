pdfjsLib.GlobalWorkerOptions.workerSrc = '';

const container = document.getElementById('container');

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'RENDER_PDF') return;
  
  const { base64Data, options = {} } = event.data;
  const { maxPages = 2, scale = 1.2, maxWidth = 380 } = options;
  
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    
    container.innerHTML = '';
    
    const info = document.createElement('div');
    info.className = 'pdf-info';
    info.textContent = `PDF Document • ${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`;
    container.appendChild(info);
    
    const pagesContainer = document.createElement('div');
    pagesContainer.className = 'pages-container';
    container.appendChild(pagesContainer);
    
    const pagesToRender = Math.min(maxPages, pdf.numPages);
    
    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      const viewport = page.getViewport({ scale: 1 });
      const adjustedScale = Math.min(scale, maxWidth / viewport.width);
      const scaledViewport = page.getViewport({ scale: adjustedScale });
      
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: scaledViewport
      }).promise;
      
      pagesContainer.appendChild(canvas);
      
      if (pagesToRender > 1) {
        const label = document.createElement('div');
        label.className = 'page-label';
        label.textContent = `Page ${pageNum}`;
        pagesContainer.appendChild(label);
      }
    }
    
    if (pdf.numPages > maxPages) {
      const more = document.createElement('div');
      more.className = 'more-pages';
      more.textContent = `+ ${pdf.numPages - maxPages} more page${pdf.numPages - maxPages > 1 ? 's' : ''}`;
      container.appendChild(more);
    }
    
    window.parent.postMessage({
      type: 'PDF_RENDERED',
      success: true,
      height: container.scrollHeight
    }, '*');
    
  } catch (error) {
    console.error('PDF render error:', error);
    
    container.innerHTML = `
      <div class="error">
        <div class="error-icon">📄</div>
        <div style="font-size: 11px;">Unable to render PDF</div>
        <div style="font-size: 9px; margin-top: 4px; opacity: 0.6;">${error.message}</div>
      </div>
    `;
    
    window.parent.postMessage({
      type: 'PDF_RENDERED',
      success: false,
      error: error.message
    }, '*');
  }
});

window.parent.postMessage({ type: 'PDF_VIEWER_READY' }, '*');