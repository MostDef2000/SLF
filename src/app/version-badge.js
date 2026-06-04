// App: SLF runtime version badge
// Shows the currently loaded userscript release version in the ЖФ header.

const SLFVersionBadge = (() => {
    const BADGE_ID = 'slf-version-inline-badge';

    function getVersion() {
        return String(
            window.SLF?.scriptVersion ||
            window.SLF?.versionInfo?.version ||
            ''
        ).trim();
    }

    function getHeaderInfo() {
        return document.querySelector('.head-ui__information');
    }

    function render() {
        const info = getHeaderInfo();
        if (!info) return false;

        const version = getVersion();
        if (!version) return false;

        document.getElementById(BADGE_ID)?.remove();

        const badge = document.createElement('span');
        badge.id = BADGE_ID;
        badge.textContent = ` ● SLF ${version}`;
        badge.title = 'SLF userscript version';
        badge.style.cssText = [
            'color:#36ff00',
            'font-weight:bold',
            'font-size:10px',
            'margin-left:6px',
            'white-space:nowrap',
            'text-shadow:0 1px 2px #000'
        ].join(';');

        info.appendChild(badge);
        return true;
    }

    function start() {
        const run = () => {
            if (render()) return;
            const timer = window.setInterval(() => {
                if (render()) window.clearInterval(timer);
            }, 250);
            window.setTimeout(() => window.clearInterval(timer), 10000);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            run();
        }
    }

    return { start, render, getVersion };
})();

SLFVersionBadge.start();
