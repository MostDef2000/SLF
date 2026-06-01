// 10.1 Strategy Data Task A UI extension
// ============================================================

(function strategyDataTaskAExtension() {
    'use strict';

    function getFallbackTargetTeam(snapshot) {
        const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
        if (!teams.length) return null;
        const selector = document.getElementById('slf-foreign-match-target');
        const side = selector?.value || 'home';
        return side === 'away' ? teams[1] : teams[0];
    }

    function normalizeForeignSnapshot(snapshot) {
        if (!snapshot || snapshot.myTeam || !Array.isArray(snapshot.teams) || snapshot.teams.length < 2) return snapshot;
        const targetTeam = getFallbackTargetTeam(snapshot);
        if (!targetTeam) return snapshot;

        snapshot.matchOwnership = 'foreign';
        snapshot.targetSide = Number(snapshot.teams[1]) === Number(targetTeam) ? 'away' : 'home';
        snapshot.myTeam = targetTeam;
        return snapshot;
    }

    function patchSnapshotBuild() {
        if (typeof SnapshotEngine === 'undefined' || SnapshotEngine.__taskAPatchedBuild) return;
        const originalBuild = SnapshotEngine.build;
        SnapshotEngine.build = function patchedTaskABuild() {
            return normalizeForeignSnapshot(originalBuild.apply(this, arguments));
        };
        SnapshotEngine.__taskAPatchedBuild = true;
    }

    function renderManualRecommendation() {
        const snapshot = normalizeForeignSnapshot(SnapshotEngine.build());
        if (!snapshot) return;

        snapshot.recommendationSource = 'manual';
        snapshot.manualRecommendationRefresh = true;
        SnapshotEngine.rememberLiveSnapshot(snapshot);

        const el = document.getElementById('slf-parser-recommendation');
        const html = RecommendationEngine.make(snapshot);
        if (el) el.innerHTML = html;
        RecommendationEngine.persistRenderedRecommendation(html, snapshot, { source: 'manual_snapshot' });
        SnapshotEngine.persistLiveState({ active: !!STATE.liveParserTimer, manualSnapshotAt: Date.now() });
        UI.addParserLog('Ручной snapshot: подсказка обновлена');
        UI.updateParserStatus('Ручной snapshot выполнен');
    }

    function mountManualButton() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-manual-recommendation-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'slf-manual-recommendation-btn';
        btn.type = 'button';
        btn.textContent = '↻ Подсказка';
        btn.title = 'Сделать ручной snapshot и обновить подсказку без остановки auto-логики';
        btn.style.cssText = 'padding:5px 8px;background:#345;color:#fff;border:1px solid #79a;border-radius:3px;cursor:pointer;';
        btn.onclick = () => {
            btn.disabled = true;
            try {
                renderManualRecommendation();
            } catch (error) {
                console.error('[SLF] Manual recommendation refresh failed', error);
                UI.addParserLog('Ручной snapshot: ошибка, см. console');
            } finally {
                btn.disabled = false;
            }
        };

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(btn, status || null);
    }

    function mountForeignSelector() {
        if (!location.pathname.includes('/game.php')) return;
        const panel = document.getElementById('slf-match-parser-panel');
        if (!panel || document.getElementById('slf-foreign-match-target')) return;

        const snapshot = SnapshotEngine.build();
        if (!snapshot || snapshot.matchOwnership !== 'foreign') return;

        const select = document.createElement('select');
        select.id = 'slf-foreign-match-target';
        select.title = 'Тестовый режим чужого матча: выбрать сторону для подсказок';
        select.style.cssText = 'padding:4px 6px;background:#333;color:#fff;border:1px solid #777;border-radius:3px;';
        select.innerHTML = '<option value="home">Анализ: хозяева</option><option value="away">Анализ: гости</option>';
        select.onchange = () => renderManualRecommendation();

        const status = document.getElementById('slf-parser-status');
        panel.insertBefore(select, status || null);
    }

    function mount() {
        patchSnapshotBuild();
        mountManualButton();
        mountForeignSelector();
    }

    const originalAddMatchParserPanel = UI.addMatchParserPanel;
    UI.addMatchParserPanel = function patchedTaskAAddMatchParserPanel() {
        const result = originalAddMatchParserPanel.apply(this, arguments);
        mount();
        return result;
    };

    mount();
})();

// ============================================================
