const fs = require('fs');
const html = fs.readFileSync('d:/Users/rshod/Desktop/organife/Proxy/site-blocker-project/lastVErsion-Test/intranet.html', 'utf8');

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const styles = styleMatch ? styleMatch[1] : '';

const overlayMatch = html.match(/<section class="kanban-modal" role="dialog"([\s\S]*?)<\/aside>/);
const overlayInner = overlayMatch ? '<section class="kanban-modal" role="dialog"' + overlayMatch[1] + '</aside>' : '';

const kanbanHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kanban - Portal Corporativo</title>
  <meta http-equiv="Content-Security-Policy" content="script-src 'self'">
  <style>
${styles}
    /* Kanban Dedicated Page Overrides */
    body.kanban-page-mode { margin: 0; padding: 0; background: #0f172a; overflow: hidden; }
    .kanban-overlay.dedicated { 
        position: static; width: 100vw; height: 100vh; background: transparent; 
        padding: 0; display: flex; align-items: stretch; z-index: 1;
    }
  </style>
</head>
<body class="kanban-page-mode">
  <div class="kanban-overlay dedicated is-open" id="kanbanOverlay" aria-hidden="false">
    ${overlayInner}
  </div>
  <script src="kanban-core.js"></script>
  <script src="kanban.js"></script>
</body>
</html>`;

fs.writeFileSync('d:/Users/rshod/Desktop/organife/Proxy/site-blocker-project/lastVErsion-Test/kanban.html', kanbanHtml);
console.log('kanban.html created successfully');
