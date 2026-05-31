// 9.7 Dave forum knowledge source
// ============================================================

const DaveEngineKnowledge = {
    sourceType: 'dave_engine_commentary',
    localKbHint: 'Local parser: slf_dave_forum_parser.py -> dave_forum_posts.jsonl / dave_generator56_posts.jsonl',
    notes: [
        {
            id: 'dave_generator_quality_vs_score',
            topic: 'Генератор 5.6',
            tags: ['generator_quality', 'variance', 'confidence'],
            text: 'Положительная подсказка генератора о качестве матча важнее одного отрицательного счёта: результат может быть хуже, чем качество игры.'
        },
        {
            id: 'dave_no_scenario_rng',
            topic: 'Генератор 5.6',
            tags: ['variance', 'xg'],
            text: 'Не считать каждый плохой счёт сценарием или подкруткой: генератор последовательно решает игровые эпизоды, xG не обязан механически совпадать со счётом.'
        },
        {
            id: 'dave_high_press_not_universal',
            topic: 'Генератор 5.6',
            tags: ['pressing', 'fatigue', 'cards'],
            text: 'Высокий прессинг после 5.6 не универсален: применять по контексту, физике, фолам и качеству структуры.'
        },
        {
            id: 'dave_bus_pressing_interaction',
            topic: 'Генератор 5.6',
            tags: ['low_block', 'pressing', 'counter'],
            text: 'Автобус под прессингом не обязан держать мяч: он играет на отбой или контратакует, если прессинг соперника плохо организован.'
        },
        {
            id: 'dave_scheme_defense_by_lines',
            topic: 'Генератор 5.6',
            tags: ['scheme', 'formation', 'pi'],
            text: 'Схема в обороне определяется количеством игроков по линиям; роль ПИ может поднять игрока на линию выше.'
        }
    ],

    getRelevantNotes(state, urgency, qualitySignal) {
        const tags = new Set(Array.isArray(state?.tags) ? state.tags : []);
        const result = [];

        if (qualitySignal?.detected) result.push(this.notes.find(x => x.id === 'dave_generator_quality_vs_score'));
        if (tags.has('under_pressure') || tags.has('late_protect_lead')) result.push(this.notes.find(x => x.id === 'dave_bus_pressing_interaction'));
        if (tags.has('bad_build_under_press') || tags.has('bait_press_possible')) result.push(this.notes.find(x => x.id === 'dave_high_press_not_universal'));
        if (urgency?.level === 'radical' || urgency?.level === 'emergency') result.push(this.notes.find(x => x.id === 'dave_scheme_defense_by_lines'));

        return [...new Map(result.filter(Boolean).map(note => [note.id, note])).values()].slice(0, 2);
    }
};
// ============================================================
