// 14.5 Training Reference Guide
// ============================================================

const SLF_TRAINING_PROFILES_V1 = [
    {
        role: 'GK',
        normal: [['ПС', 8], ['СВ', 7], ['ТВ', 7], ['СК', 6], ['РЕ', 23], ['ИВ', 22], ['ВП', 22], ['РМ', 6], ['ПИ', 2], ['ВВ', 58]],
        top: [['ПС', 9], ['СВ', 8], ['ТВ', 8], ['СК', 8], ['РЕ', 26], ['ИВ', 26], ['ВП', 26], ['РМ', 8], ['ПИ', 2], ['ВВ', 66]]
    },
    {
        role: 'CD',
        normal: [['ПС', 15], ['СУ', 4], ['ТУ', 4], ['СК', 19], ['УС', 19], ['ОТ', 25], ['ВП', 24], ['ТХ', 11], ['БВ', 23], ['КР', 14]],
        top: [['ПС', 18], ['СУ', 5], ['ТУ', 5], ['СК', 23], ['УС', 23], ['ОТ', 30], ['ВП', 28], ['ТХ', 12], ['БВ', 27], ['КР', 17]]
    },
    {
        role: 'LD / RD',
        normal: [['ПС', 17], ['СУ', 4], ['ТУ', 4], ['СК', 22], ['УС', 22], ['ОТ', 25], ['ВП', 23], ['ТХ', 13], ['БВ', 16], ['КР', 16]],
        top: [['ПС', 20], ['СУ', 5], ['ТУ', 5], ['СК', 25], ['УС', 25], ['ОТ', 30], ['ВП', 26], ['ТХ', 15], ['БВ', 18], ['КР', 18]]
    },
    {
        role: 'DM',
        normal: [['ПС', 23], ['СУ', 8], ['ТУ', 8], ['СК', 19], ['УС', 20], ['ОТ', 24], ['ВП', 23], ['ТХ', 18], ['БВ', 11], ['КР', 18]],
        top: [['ПС', 26], ['СУ', 10], ['ТУ', 10], ['СК', 23], ['УС', 23], ['ОТ', 29], ['ВП', 27], ['ТХ', 21], ['БВ', 12], ['КР', 21]]
    },
    {
        role: 'CM',
        normal: [['ПС', 26], ['СУ', 16], ['ТУ', 16], ['СК', 20], ['УС', 20], ['ОТ', 4], ['ВП', 18], ['ТХ', 22], ['БВ', 8], ['КР', 22]],
        top: [['ПС', 30], ['СУ', 19], ['ТУ', 19], ['СК', 23], ['УС', 23], ['ОТ', 5], ['ВП', 20], ['ТХ', 25], ['БВ', 9], ['КР', 25]]
    },
    {
        role: 'LM / RM',
        normal: [['ПС', 25], ['СУ', 15], ['ТУ', 15], ['СК', 23], ['УС', 22], ['ОТ', 3], ['ВП', 15], ['ТХ', 22], ['БВ', 8], ['КР', 21]],
        top: [['ПС', 28], ['СУ', 18], ['ТУ', 18], ['СК', 26], ['УС', 25], ['ОТ', 3], ['ВП', 18], ['ТХ', 25], ['БВ', 9], ['КР', 24]]
    },
    {
        role: 'LW / RW',
        normal: [['ПС', 24], ['СУ', 20], ['ТУ', 20], ['СК', 22], ['УС', 22], ['ОТ', 2], ['ВП', 16], ['ТХ', 22], ['БВ', 8], ['КР', 21]],
        top: [['ПС', 27], ['СУ', 24], ['ТУ', 24], ['СК', 25], ['УС', 25], ['ОТ', 2], ['ВП', 19], ['ТХ', 25], ['БВ', 9], ['КР', 24]]
    },
    {
        role: 'AM',
        normal: [['ПС', 22], ['СУ', 22], ['ТУ', 22], ['СК', 19], ['УС', 19], ['ОТ', 2], ['ВП', 17], ['ТХ', 20], ['БВ', 9], ['КР', 19]],
        top: [['ПС', 27], ['СУ', 26], ['ТУ', 26], ['СК', 23], ['УС', 23], ['ОТ', 2], ['ВП', 20], ['ТХ', 24], ['БВ', 11], ['КР', 23]]
    },
    {
        role: 'ST',
        normal: [['ПС', 11], ['СУ', 25], ['ТУ', 25], ['СК', 18], ['УС', 18], ['ОТ', 2], ['ВП', 20], ['ТХ', 18], ['БВ', 20], ['КР', 16]],
        top: [['ПС', 13], ['СУ', 29], ['ТУ', 29], ['СК', 22], ['УС', 21], ['ОТ', 2], ['ВП', 23], ['ТХ', 21], ['БВ', 26], ['КР', 18]]
    }
];

const TrainingGuidePanel = {
    panelId: 'slf-training-guide-panel',

    isPage() {
        return location.pathname.includes('/train.php');
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    },

    rows() {
        return SLF_TRAINING_PROFILES_V1;
    },

    formatProfile(role, column, profile) {
        const pairs = Array.isArray(profile) ? profile : [];
        return pairs
            .map(([skill, value]) => `
                <span class="slf-train-pair" data-slf-role="${this.escapeHtml(role)}" data-slf-col="${this.escapeHtml(column)}" data-slf-skill="${this.escapeHtml(skill)}" data-slf-value="${this.escapeHtml(value)}">
                    <span class="slf-train-skill">${this.escapeHtml(skill)}</span>
                    <span class="slf-train-value">${this.escapeHtml(value)}</span>
                </span>
            `)
            .join('');
    },

    renderContent() {
        const rows = this.rows().map(row => `
            <tr data-slf-training-role="${this.escapeHtml(row.role)}">
                <td style="padding:4px 6px;border-bottom:1px solid #333;white-space:nowrap;color:#ffd76a;font-weight:bold;vertical-align:top;">
                    ${this.escapeHtml(row.role)}
                </td>
                <td data-slf-profile-col="normal" style="padding:4px 4px;border-bottom:1px solid #333;line-height:1.35;max-width:235px;vertical-align:top;">${this.formatProfile(row.role, 'normal', row.normal)}</td>
                <td data-slf-profile-col="top" style="padding:4px 4px;border-bottom:1px solid #333;line-height:1.35;max-width:235px;vertical-align:top;">${this.formatProfile(row.role, 'top', row.top)}</td>
            </tr>
        `).join('');

        return `
            <div style="font-weight:bold;color:#7cff7c;margin-bottom:5px;">SLF Training Profiles v1</div>
            <style>
                #slf-training-guide-panel .slf-train-pair{display:inline-block;margin:0 5px 2px 0;white-space:nowrap;}
                #slf-training-guide-panel .slf-train-skill{color:#8cf;font-weight:bold;}
                #slf-training-guide-panel .slf-train-value{color:#fff;}
            </style>
            <table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                    <tr style="text-align:left;color:#8cf;">
                        <th style="padding:4px 6px;border-bottom:1px solid #555;">Роль</th>
                        <th style="padding:4px 5px;border-bottom:1px solid #555;">normal</th>
                        <th style="padding:4px 5px;border-bottom:1px solid #555;">top</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    },

    pairKey(pair) {
        return `${pair[0]}:${Number(pair[1])}`;
    },

    validateRendered() {
        const panel = document.getElementById(this.panelId);
        if (!panel) return;

        const allowedRoles = this.rows().map(row => row.role);
        const renderedRoles = [...panel.querySelectorAll('[data-slf-training-role]')]
            .map(el => el.getAttribute('data-slf-training-role'));
        const oldRoles = renderedRoles.filter(role => role === 'DL / DR' || role === 'ML / MR / LW / RW');
        let suspiciousScaleValues = 0;
        let failedRows = 0;

        this.rows().forEach(row => {
            ['normal', 'top'].forEach(column => {
                const expected = row[column].map(pair => this.pairKey(pair)).join('|');
                const found = [...panel.querySelectorAll(`[data-slf-role="${CSS.escape(row.role)}"][data-slf-col="${column}"]`)]
                    .map(el => `${el.getAttribute('data-slf-skill')}:${Number(el.getAttribute('data-slf-value'))}`)
                    .join('|');

                row[column].forEach(pair => {
                    const value = Number(pair[1]);
                    if (Number.isFinite(value) && value >= 100) suspiciousScaleValues++;
                });

                if (expected === found) {
                    console.log(`[SLF Training Profiles] OK ${row.role} ${column}`);
                } else {
                    failedRows++;
                    console.warn('[SLF Training Profiles] mismatch', { role: row.role, column, expected, found });
                }
            });
        });

        const missingRoles = allowedRoles.filter(role => !renderedRoles.includes(role));
        const extraRoles = renderedRoles.filter(role => !allowedRoles.includes(role));

        if (oldRoles.length || missingRoles.length || extraRoles.length || suspiciousScaleValues || failedRows) {
            console.warn('[SLF Training Profiles] validation failed', {
                failedRows,
                oldRoles,
                missingRoles,
                extraRoles,
                suspiciousScaleValues
            });
        } else {
            console.log('[SLF Training Profiles] validation summary: OK all rows; suspiciousScaleValues=0');
        }
    },

    findTrainingAnchor() {
        const train = document.querySelector('#train');
        if (train) return train;

        const selectors = [
            '.pad2',
            '.team_general_content',
            '.content',
            '#content',
            'form[action*="train.php"]',
            'table'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }

        return document.body;
    },

    mount() {
        if (!this.isPage()) return;
        if (document.getElementById(this.panelId)) return;

        const train = document.querySelector('#train');
        const pad = train?.closest('.pad2') || document.querySelector('.pad2');
        const anchor = this.findTrainingAnchor();
        const panel = document.createElement('div');
        panel.id = this.panelId;
        panel.style.cssText = `
            flex:0 0 620px;
            width:620px;
            max-width:620px;
            min-width:500px;
            margin:0 0 12px 18px;
            padding:8px 10px;
            background:#222;
            color:#fff;
            border:1px solid #555;
            border-radius:6px;
            font-family:Arial,sans-serif;
            font-size:12px;
            box-sizing:border-box;
            align-self:flex-start;
        `;

        panel.innerHTML = this.renderContent();

        if (train && pad) {
            const wrapper = document.createElement('div');
            wrapper.id = 'slf-training-guide-layout';
            wrapper.style.cssText = `
                display:flex;
                align-items:flex-start;
                justify-content:flex-start;
                gap:18px;
                width:100%;
                box-sizing:border-box;
            `;

            const left = document.createElement('div');
            left.id = 'slf-training-left-column';
            left.style.cssText = `
                flex:0 0 auto;
                min-width:0;
                box-sizing:border-box;
            `;

            pad.insertBefore(wrapper, train);
            left.appendChild(train);

            const nextForms = [...pad.querySelectorAll('form')]
                .filter(form => form !== train && !form.contains(panel))
                .filter(form => /очист|clean|train/i.test(form.innerText || form.textContent || form.action || ''));

            nextForms.slice(0, 2).forEach(form => left.appendChild(form));

            wrapper.appendChild(left);
            wrapper.appendChild(panel);
            this.validateRendered();
            return;
        }

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(panel, anchor.nextSibling);
        } else {
            document.body.prepend(panel);
        }

        this.validateRendered();
    }
};


// ============================================================
