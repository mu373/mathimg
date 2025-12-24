/*
 Help Script for Table of Contents
*/

const directories = window.location.href.split('/').slice(-3)
const isTop = (directories[1] != 'pgs')

// Enable TOC button in the Help Viewer's toolbar
document.addEventListener("DOMContentLoaded", () => {
    function toggleTOC() {
        window.location = (isTop) ? "toc.html" : "../toc.html";
    }

    if ('HelpViewer' in window) {
        window.HelpViewer.showTOCButton(true, toggleTOC, toggleTOC);
    }
});

// Insert ToC link on subpages
if (!isTop) {
    document.addEventListener("DOMContentLoaded", () => {
        const tocButton = document.createElement("a");
        tocButton.className = "toc";
        tocButton.href = "../toc.html";
        tocButton.textContent = "Table of Contents";
        document.body.prepend(tocButton);
    });
}
