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

        const isMatchPage = location.pathname.includes('/game.php');
        const delay = isMatchPage ? 400 : 150;
        let scheduled = false;

        const run = () => {
            if (scheduled) return;

            scheduled = true;

            setTimeout(() => {
                scheduled = false;
                if (isMatchPage) {
                    window.__slf_match_ui_observer_runs =
                        Number(window.__slf_match_ui_observer_runs || 0) + 1;
                }
                callback();
            }, delay);
        };

        if (!isMatchPage) {
            const observer = new MutationObserver(run);

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            window.__slf_ui_observer_target = 'body';
            run();
            return;
        }

        const relevantSelector = [
            '#slf-match-parser-panel',
            '#slf-tactics-dropdown',
            // β design (issue #370 follow-up): lazy compare-tab tactic cards
            '.tc-block',
            '.tc-seg',
            '.team_general_content',
            '.game_control',
            '#game_control',
            '.game_tab_content',
            '.tabs_content',
            'input[name="def_line"]',
            // fm2026v2 tactic cards (issue #370)
            '.ui-tactic__wrap',
            'form.tactics__form',
            '.ui-tactic-manager',
            '.ui-tactic-manager__form',
            '.team-control__block',
            '.lineup__wrapper'
        ].join(',');

        const isRelevantNode = node => {
            if (!node || node.nodeType !== 1) return false;
            return node.matches(relevantSelector) || !!node.querySelector(relevantSelector);
        };

        const handleMutations = mutations => {
            const relevant = mutations.some(mutation =>
                [...mutation.addedNodes, ...mutation.removedNodes].some(isRelevantNode)
            );
            if (relevant) run();
        };

        const installMatchObserver = root => {
            if (!root || window.__slf_match_ui_observer_state === 'ready') return;

            const observer = new MutationObserver(handleMutations);
            observer.observe(root, {
                childList: true,
                subtree: true
            });

            window.__slf_ui_observer_target = 'match-content';
            window.__slf_match_ui_observer_state = 'ready';
            run();
        };

        const root =
            document.querySelector('.content-ui__wrapper') ||
            document.querySelector('.match_content') ||
            // β design (issue #370 follow-up): wrapper-less radio-less match
            // pages get a filtered body root so lazy compare-tab cards are
            // seen; the mountUI β gate (tc-seg anchor required) decides what
            // actually mounts, so a permissive root here is safe.
            (!document.querySelector('input[name="def_line"]') &&
                document.querySelector('.control_field_1') ? document.body : null);

        if (root) {
            installMatchObserver(root);
            return;
        }

        window.__slf_match_ui_observer_state = 'waiting';
        this.waitForElement(
            '.content-ui__wrapper, .match_content, .ui-tactic__wrap', // fm2026v2 tactic cards (issue #370)
            element => {
                // fm2026v2 tactic cards (issue #370): climb from a narrow card
                // to a wider container so out-of-card match mutations still
                // re-sync the panels.
                const wide = element && element.classList.contains('ui-tactic__wrap')
                    ? (element.closest('.ui-tactic-manager') || element.closest('form') || element.parentElement)
                    : element;
                installMatchObserver(wide || element);
            },
            50,
            100
        );
    }
};
    // ============================================================
