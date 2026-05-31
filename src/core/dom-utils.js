// 1.5 DOM / UI Mount Helpers
// ============================================================

const DomUtils = {
    waitForElement(selector, callback, maxTries = 50, delay = 100) {
        let tries = 0;

        const check = () => {
            const el = document.querySelector(selector);

            if (el) {
                callback(el);
                return;
            }

            tries++;

            if (tries >= maxTries) return;

            setTimeout(check, delay);
        };

        check();
    },

    installObserver(callback) {
        if (window.__slf_ui_observer_installed) return;
        window.__slf_ui_observer_installed = true;

        let scheduled = false;

        const run = () => {
            if (scheduled) return;

            scheduled = true;

            setTimeout(() => {
                scheduled = false;
                callback();
            }, 150);
        };

        const observer = new MutationObserver(run);

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        run();
    }
};
    // ============================================================
