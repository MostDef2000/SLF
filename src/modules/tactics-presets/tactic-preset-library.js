// 9.8 Tactic Preset Library
// ============================================================

const TacticPresetLibrary = {
    meta: {
        // ----------------------------
        // DEFENSIVE
        // ----------------------------
        Simeone_LowBlock_def5: {
            group: 'defensive',
            rank: 5,
            title: 'Simeone Low Block',
            idea: 'максимально низкий и компактный блок, минимум риска, приоритет — не раскрыться',
            use: 'когда ведём в концовке, соперник давит, xGA растёт или нужно просто пережить отрезок',
            risk: 'можно слишком отдать инициативу и перестать выходить из обороны'
        },

        Simeone_Compact442_def4: {
            group: 'defensive',
            rank: 4,
            title: 'Simeone Compact',
            idea: 'компактная оборона без полной посадки назад, фланги как безопасный выход',
            use: 'когда соперник опаснее, но ещё не нужно уходить в глухую защиту',
            risk: 'если совсем отказаться от продвижения, давление соперника будет накапливаться'
        },

        Mourinho_WeakSide_def3: {
            group: 'defensive',
            rank: 3,
            title: 'Mourinho Weak Side',
            idea: 'низкий/средний блок и быстрый выход в слабую сторону соперника',
            use: 'когда соперник давит, а у нас есть пространство за его линиями или слабый фланг',
            risk: 'если нет скорости и точного первого паса, контратаки будут срываться'
        },

        Henta_Hold_def3: {
            group: 'defensive',
            rank: 3,
            title: 'Henta Hold',
            idea: 'низкий блок как у Henta, но осторожнее с мячом; агрессия остаётся в отборах',
            use: 'когда нужно удерживать счёт, но обычная защита слишком пассивная',
            risk: 'может не хватить угрозы впереди'
        },

        // ----------------------------
        // BALANCE / CONTROL
        // ----------------------------
        Pep_StandardControl_bal3: {
            group: 'balance',
            rank: 3,
            title: 'Pep Standard Control',
            idea: 'стандартный контроль с умеренным риском и без перекоса в одну зону',
            use: 'когда игра равная, нет явных сигналов менять структуру или нужно вернуться к базе',
            risk: 'может быть слишком нейтрально, если срочно нужен гол'
        },

        Xabi_BoxMidfield_bal3: {
            group: 'balance',
            rank: 3,
            title: 'Xabi Box Midfield',
            idea: 'перегруз центра, контроль переходов, умный прессинг через CM/DM/AM',
            use: 'когда нужен контроль центра, есть игроки в средней линии и брак не высокий',
            risk: 'при закрытом центре лучше не форсировать — можно упереться в плотный блок'
        },

        Pep_BoxControl_bal2: {
            group: 'balance',
            rank: 2,
            title: 'Pep Box Control',
            idea: 'спокойный контроль через центр, короткий розыгрыш и минимум хаоса',
            use: 'когда нужно успокоить игру, снизить брак или вскрывать низкий блок терпением',
            risk: 'против высокого прессинга можно застрять в розыгрыше'
        },

        Pep_ControlledPush_att3: {
            group: 'attack',
            rank: 3,
            title: 'Pep Controlled Push',
            idea: 'аккуратно усилить атаку без ломки работающей обороны: выше темп, больше продвижения, умеренный риск',
            use: 'когда оборона по генератору работает, а атака недобирает xG относительно ожидаемого',
            risk: 'если брак уже высокий, усиление атаки может превратиться в потери'
        },

        Xabi_VerticalBox_att3: {
            group: 'attack',
            rank: 3,
            title: 'Xabi Vertical Box',
            idea: 'более вертикальный box-midfield: центр сохраняет контроль, но быстрее ищет вход между линиями',
            use: 'когда центр доступен, брак низкий, атака недобирает, а оборонительная структура не должна ломаться',
            risk: 'при закрытом центре или высоком прессинге соперника вертикальность даст брак'
        },

        Pep_PressCooldown_bal2: {
            group: 'balance',
            rank: 2,
            title: 'Pep Press Cooldown',
            idea: 'снизить цену прессинга, вернуть контроль и сохранить структуру без посадки в автобус',
            use: 'когда высокий прессинг выматывает: сила на поле падает, растёт брак/фолы или ухудшается xT',
            risk: 'если срочно нужен гол, может не хватить давления'
        },

        Compact_Counter_def3: {
            group: 'defensive',
            rank: 3,
            title: 'Compact Counter',
            idea: 'закрыть переходы и сохранить быстрый выход, не превращая матч в полный низкий блок',
            use: 'когда атака что-то создаёт, но оборона недобирает или соперник опасен в переходах',
            risk: 'если слишком рано уйти в компактность, атака потеряет давление'
        },

        DeZerbi_BaitPress_bal3: {
            group: 'balance',
            rank: 3,
            title: 'De Zerbi Bait Press',
            idea: 'заманить прессинг соперника, вытянуть его линии и открыть пространство выше',
            use: 'когда соперник высоко прессингует, а у нас достаточно качества паса',
            risk: 'при слабых защитниках/DM можно привезти опасный момент'
        },

        Conte_WingbackWidth_bal4: {
            group: 'balance',
            rank: 4,
            title: 'Conte Wingback Width',
            idea: 'ширина через фланги, растягивание обороны, давление коридорами',
            use: 'когда центр закрыт, но фланги доступны или есть сильные ML/MR/DL/DR',
            risk: 'если фланги слабые, атака станет навесным шумом'
        },

        // ----------------------------
        // ATTACK
        // ----------------------------
        Klopp_Gegenpress_att4: {
            group: 'attack',
            rank: 4,
            title: 'Klopp Gegenpress',
            idea: 'высокий прессинг, быстрый темп, давление после потерь и агрессивные атаки',
            use: 'когда нужно переломить матч, соперник ошибается под давлением или мы проигрываем после 60-й',
            risk: 'усталость, фолы и пространство за спиной защитников'
        },

        Bielsa_ChaosPress_att5: {
            group: 'attack',
            rank: 5,
            title: 'Bielsa Chaos Press',
            idea: 'максимальный темп, максимальное давление, высокий риск ради спасения матча',
            use: 'когда 80+ минута, проигрываем и терять уже почти нечего',
            risk: 'может полностью развалить оборону'
        },

        Pep_TwoThreeFive_att3: {
            group: 'attack',
            rank: 3,
            title: 'Pep Positional Attack',
            idea: 'территориальное давление, высокая линия и постоянное присутствие в атакующих зонах',
            use: 'когда мы сильнее по xG/xT и нужно дожать без полного хаоса',
            risk: 'опасно против быстрых контратак'
        },

        DeZerbi_Release_att4: {
            group: 'attack',
            rank: 4,
            title: 'De Zerbi Release',
            idea: 'после заманивания прессинга быстро выпускать атаку в свободные зоны',
            use: 'когда соперник вышел высоко, а за его линиями есть пространство',
            risk: 'если пространство не появляется, риск паса станет пустым'
        },

        Klopp_WideTrap_att4: {
            group: 'attack',
            rank: 4,
            title: 'Klopp Wide Trap',
            idea: 'высокий прессинг и атака через оба фланга, обход закрытого центра',
            use: 'когда движок советует убрать центр или логичны оба фланга',
            risk: 'если нет флангового преимущества, атаки могут стать предсказуемыми'
        },

        // ----------------------------
        // HENTA EXPERIMENTAL
        // ----------------------------
        Henta_LeftTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Left Trap',
            idea: 'низкий блок, агрессивный отбор и левофланговая атака',
            use: 'когда слабый правый фланг соперника или твой левый фланг хорошо продвигает мяч',
            risk: 'перекос влево может стать читаемым'
        },

        Henta_RightTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Right Trap',
            idea: 'зеркальная Henta через правый фланг',
            use: 'когда слабый левый фланг соперника или твой правый фланг сильнее',
            risk: 'перекос вправо может стать читаемым'
        },

        Henta_WideTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Wide Trap',
            idea: 'низкий блок, агрессивные отборы и атака через оба фланга',
            use: 'когда центр закрыт, высокий прессинг мешает розыгрышу или движок советует убрать центр',
            risk: 'если фланги не дают качества, xG может не расти'
        },

        Henta_CounterTrap_att4: {
            group: 'henta',
            rank: 4,
            title: 'Henta Counter Trap',
            idea: 'Henta с более резким выходом: низко отбираем и быстрее бьём в свободное пространство',
            use: 'когда соперник давит и оставляет зоны за спиной',
            risk: 'при высоком браке контратаки будут теряться'
        },

        Henta_CentralTrap_att3: {
            group: 'henta',
            rank: 3,
            title: 'Henta Central Trap',
            idea: 'экспериментальная Henta через центр, если соперник слаб в DM/CM/DC',
            use: 'когда у соперника проседает центр, а у нас низкий брак и есть контроль',
            risk: 'если центр закрыт, лучше не форсировать'
        }
    },

    schemeStates: {
        base_balance: '4-2-3-1 / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        stable_control: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        controlled_push: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW / ST2',
        vertical_box: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        press_cooldown: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        compact_counter: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        hold_score: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        under_pressure: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM1-CM2-DM3-RM / ST2',
        late_protect_lead: '5-4-1 / GK-LB-CD1-CD2-CD3-RB / LM-DM2-CM2-RM / ST2',
        need_goal_55_75: '4-2-3-1 / GK-LD-CD1-CD3-RD / CM2-DM2 / LW-AM2-RW / ST2',
        late_need_goal: '4-2-4 / GK-LD-CD1-CD3-RD / DM2-CM2 / LW-AM2-RW-ST2',
        center_closed: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2',
        center_weak: '4-2-3-1 / GK-LD-CD1-CD3-RD / DM2-CM2 / LM-AM2-RM / ST2',
        low_block_sterile: '4-2-3-1 / GK-LD-CD1-CD3-RD / CM1-DM2 / LW-AM2-RW / ST2',
        wingback_width: '4-2-3-1 / GK-LB-CD1-CD3-RB / DM2-CM2 / LW-AM2-RW / ST2',
        counter_trap: '4-5-1 / GK-LD-CD1-CD3-RD / LM-DM2-CM2-CM3-RM / ST2'
    },

    presetSchemeState: {
        standard: 'base_balance',
        Simeone_LowBlock_def5: 'late_protect_lead',
        Simeone_Compact442_def4: 'hold_score',
        Mourinho_WeakSide_def3: 'counter_trap',
        Henta_Hold_def3: 'under_pressure',
        Pep_StandardControl_bal3: 'base_balance',
        Xabi_BoxMidfield_bal3: 'center_weak',
        Pep_BoxControl_bal2: 'stable_control',
        Pep_ControlledPush_att3: 'controlled_push',
        Xabi_VerticalBox_att3: 'vertical_box',
        Pep_PressCooldown_bal2: 'press_cooldown',
        Compact_Counter_def3: 'compact_counter',
        DeZerbi_BaitPress_bal3: 'stable_control',
        Conte_WingbackWidth_bal4: 'wingback_width',
        Klopp_Gegenpress_att4: 'need_goal_55_75',
        Bielsa_ChaosPress_att5: 'late_need_goal',
        Pep_TwoThreeFive_att3: 'low_block_sterile',
        DeZerbi_Release_att4: 'counter_trap',
        Klopp_WideTrap_att4: 'center_closed',
        Henta_LeftTrap_att3: 'counter_trap',
        Henta_RightTrap_att3: 'counter_trap',
        Henta_WideTrap_att3: 'center_closed',
        Henta_CounterTrap_att4: 'counter_trap',
        Henta_CentralTrap_att3: 'center_weak'
    },

    getSchemeForPreset(name) {
        const state = this.presetSchemeState[name] || 'base_balance';
        return this.schemeStates[state] || this.schemeStates.base_balance;
    },

    makeSchemeHint(name) {
        const scheme = this.getSchemeForPreset(name);
        const title = this.meta[name]?.title || name || '';
        return scheme ? `Схема для ${title}: ${scheme}.` : '';
    },

    makeHint(name, reason) {
        return this.makeRoleHint('Рекомендуемый', name, reason);
    },

    makeRoleHint(role, name, reason) {
        const meta = this.meta[name];
        const label = meta?.title || name;

        if (!meta) {
            return [
                `${role}: ${name}.`,
                `Действие: поставь ${name}.`,
                reason ? `Причина: ${reason}.` : ''
            ].filter(Boolean).join(' ');
        }

        return [
            `${role}: ${label}.`,
            reason ? `Причина: ${reason}.` : '',
            `Идея: ${meta.idea}.`,
            `Риск: ${meta.risk}.`
        ].filter(Boolean).join(' ');
    },

    makeRoleNameHint(role, name) {
        const meta = this.meta[name];
        const label = meta?.title || name;
        return `${role}: ${label}.`;
    },

    getGroup(name) {
        return this.meta[name]?.group || 'custom';
    },

    getRank(name) {
        return Number(this.meta[name]?.rank || 0);
    },

    getShortDescription(name) {
        const meta = this.meta[name];

        if (!meta) return '';

        return `${meta.title}: ${meta.idea}. Использовать: ${meta.use}. Риск: ${meta.risk}.`;
    }
};

// ============================================================
