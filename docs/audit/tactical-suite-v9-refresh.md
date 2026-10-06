# Аудит-отчёт: Tactical Suite v9 — обновление набора (issue #325, parent #252)

- **Issue:** MostDef2000/SLF#325 (parent #252, аудит-комментарий 6017616745, вердикт NOT_READY_FOR_EVIDENCE_RANKING)
- **База:** `c5ca7de7a475d986cd601e0635369313ec5fb34a` + некоммиченное состояние R1–R4 (ветка `feat/tactical-suite-v9`)
- **Статус документа:** документация **до** накопления v9-когорты (prior documentation). Все числа ниже — это структурные/детерминистические факты реализованного состояния v9, а **не статистические доказательства** эффективности набора. Статистическую оценку сможет дать только аудит на чистой v9-когорте после релиза.
- **Версия набора:** `slf_tactic_suite_561_v9`; политика `5.61-tactical-suite-v9-hold-current`; схема рекомендации `slf_rule_decision_v9_tactical_suite`; инвентарь `slf_active_preset_inventory_v3` (генерируется `tools/sync-active-preset-inventory.mjs`).

## Root-cause summary

Аудит #252 зафиксировал вердикт **NOT_READY_FOR_EVIDENCE_RANKING** на четырёх классах дефектов базового состояния (v8):

1. **Загрязнение телеметрии неявным фолбэком.** 9 производственных точек чтения решения молча подставляли жёстко зашитый пресет (как правило `Arteta_Control433_bal3`), когда валидного решения не было. Ключевое загрязнение — 13 из 26 строк с `fallbackApplied`-семантикой в аудите #252: ситуация hold записывалась так, будто пресет был рекомендован и/или применён.
2. **Дрейф реестра и инвентаря.** `active-preset-inventory-v2.json` расходился с активным реестром: `presetCount` 11 вместо 10, 15 полевых расхождений, устаревший список `nearestPairs`. Генератора и CI-гейта, связывающего инвентарь с реестром, не существовало.
3. **Нарушение single-writer для телеметрии.** `enrich()` в event-tracker заменял (`REPLACE`) объект `tacticTelemetry` вместо слияния (`MERGE`), из-за чего `recommendedPreset`, проставленный политикой в момент решения, терялся до подсчёта эффектов.
4. **Отсутствие evidence-хука.** В формуле ранжирования не было ограниченного слота под evidence-поправку — у #252 не было точки, к которой будущая evidence-логика могла бы присоединиться.

v9 устраняет все четыре класса: фолбэк-подстановки запрещены (hold-current вместо пресета), инвентарь v3 генерируется из реестра детерминистично и проверяется в CI, `enrich()` работает в режиме MERGE (prior wins), в score добавлен bounded-слот `boundedEvidenceAdjustment`, который остаётся нулём до готовности данных.

## Eliminated fallback paths

Все 9 неявных фолбэк-точек устранены (v8-поведение → v9-поведение):

| # | Точка (файл:узел) | v8 | v9 |
|---|---|---|---|
| 1 | `tactic-preset-direction-policy.js` — `choose()` | дефолт-объект `Arteta_Control433_bal3` при пустом eligible | hold_current-объект: `name:null`, `hold:true`, `fallbackReason:'no_eligible_candidate'` |
| 2 | `tactic-preset-direction-policy.js` — `selectRawPreset` (`selectSuiteV9`) | инъекция Arteta при невалидном/отсутствующем решении | hold `{name:null, progressionAction:'hold_current', fallbackReason:'invalid_preset'\|'no_decision'}` |
| 3 | `tactic-preset-direction-policy.js` — `preferredPreset` | дефолт Arteta для неизвестных ситуаций | `null` |
| 4 | `cah-runtime-context.js` — PresetRuleScorer | `candidates.find(Arteta)` — мог выбрать VETO-нутый пресет | `selected` остаётся `null` |
| 5 | `cah-runtime-context.js` — `action.preset` | строковый дефолт Arteta | `null` |
| 6 | `cah-decision-core.js` — `toPlanRows` | display-дефолт Arteta | текст hold: «Рекомендация отсутствует — оставить текущую тактику» |
| 7 | `re-plan-engine.js` — `selectPreset` | дефолт `Pep_BoxControl_bal2` | null-hold план-строка «Нет безопасной рекомендации — оставить текущую тактику» |
| 8 | `re-plan-engine.js` — legacy `selectRawPreset` | возврат id удалённых пресетов | registry-safe-обёртка: `null`, если реестр присутствует и id не входит в `active` |
| 9 | `current-action-hint-engine.js` — `ACTIVE_PRESETS` | выведенный из строя `Compact_Counter_def3` оставался выбираемым | удалён из выбираемого множества (сигнатура сохранена в `TACTIC_SIGNATURES` с пометкой `legacy_retired` — только для детектирования) |

## Canonical source of truth

- **Реестр** `src/modules/tactics-presets/active-preset-registry.js` — единственный владелец тактических данных: пресеты, формации, роли, контракты ролей, ситуации, controlFields, идентичность набора (`suiteVersion`, `recommendationSchema`, `fallbackPolicy`, `inventorySchema`).
- **Генератор/валидатор** `tools/sync-active-preset-inventory.mjs` — режим `--check` (по умолчанию) сверяет `data/tactics/active-preset-inventory-v3.json` байт-в-байт с реестром; режим `--write` регенерирует. В обоих режимах валидируются инварианты реестра: количество (10), отсутствие вышедших из набора пресетов, глубокое равенство `roleContracts[id].controls == registry.presets[id]`, покрытие всех 10 ситуаций (каждая ситуация — ровно один primary-держатель + allowedSituations), `fallbackEligible === false` у всех. Детерминизм: без меток времени, стабильный порядок ключей, 2-пробельный JSON с завершающим переводом строки.
- **CI-регистрация** `.github/workflows/quality-integration.yml`: синтаксис-гейты `node --check` для трёх новых/обновлённых тестов и синк-тула в обоих джобах `static-contract-security` (строки 39–42) и `runtime-tactics` (строки 111–114); исполнения — `test-tactical-situation-diversity.mjs` + `sync --check` в `static-contract-security` (строки 65–66); `test-tactic-telemetry-envelope.mjs` + diversity + fallback-hold + transition-graph + `sync --check` в `runtime-tactics` (строки 154–161). Дрейф инвентаря роняет агрегатный `SLF CI / ci`.

## Suite diff v8 → v9

Формации всех 10 пресетов **не изменены**. Изменены 4 пресета, по 14 control-полям; изменённые поля помечены `v8→v9`:

| Пресет | Изменённые поля (v8→v9) | Прочие 11 полей |
|---|---|---|
| `Pep_BoxControl_bal2` | `build_fast` 2→1, `dribble` 2→1, `shot` 2→1 | без изменений |
| `Conte_WingbackWidth_bal4` | `cross` 5→4 | без изменений |
| `Simeone_LowBlock_def5` | `build_fast` 2→1 | без изменений |
| `Bielsa_ChaosPress_att5` | `cross` 5→4 | без изменений |

Остальные 6 пресетов (`Arteta_Control433_bal3`, `Pep_PressCooldown_bal2`, `Pep_ControlledPush_att3`, `Pep_TwoThreeFive_att3`, `Klopp_Gegenpress_att4`, `Simeone_Compact442_def4`) — все 14 полей без изменений.

**`Arteta_Control433_bal3` сохранён намеренно.** Переработка v9 для базового пресета — семантическая: он перестаёт быть фолбэк-идентичностью (ни одна точка больше его не подставляет), а не численной перенастройкой. Изменение его контролов обесценило бы сопоставимость v8↔v9 по роли stable_control без доказанной пользы.

**Семантика миграции:** идентификаторы пресетов не меняются; принадлежность строки телеметрии к поколению определяется `libraryVersion` (`slf_tactic_suite_561_v8` → `slf_tactic_suite_561_v9`) и `recommendationSchema` (`slf_rule_decision_v8_tactical_suite` → `slf_rule_decision_v9_tactical_suite`). Старые строки телеметрии не переписываются; когорты аудируются раздельно. Когортная изоляция enforced и downstream на этапе агрегации: с момента находки валидатора (SLF#325) `groupKey` в `tools/aggregate-tactic-performance.mjs` включает оба когортных лейбла (`libraryVersion` и `recommendationSchema`), поэтому v8/v9-фазовые строки с совпадающими остальными измерениями больше не могут слиться в один агрегат.

## Role explanations

- **`Arteta_Control433_bal3` (stable_control, medium).** Базовый план равного матча: структурный контроль 4-3-3 без принудительного форсирования. Входит как отправная точка равного матча и покидает при давлении без контрвыхода (→ BoxControl), потребности в голе (→ ControlledPush), открытой ширине (→ Conte) или защите преимущества (→ Compact442). Отличимость: единственный пресет без entry-условий — это нейтральный фон, от которого отсчитываются все переходы; в v9 он более не является фолбэк-идентичностью.
- **`Pep_BoxControl_bal2` (pressure_escape, low).** Press-resistant контроль 4-1-2-2-1: выход из давления без прямой контратаки и reset после брака. Входит при `pressure_without_counter_exit`; выходит при стабилизации (→ Arteta) или усталости/росте брака (→ PressCooldown). Отличимость: минимальный атакующий профиль в наборе (dribble/shot/cross = 1) — в v9 это подчёркнуто численно (build_fast/dribble/shot 2→1).
- **`Pep_PressCooldown_bal2` (press_cooldown, low).** Коолдаун прессинга: снизить цену прессинга при fatigue, росте брака/фолов или падении силы. Входит по `press_fatigue`; выходит при восстановлении (→ BoxControl), готовности структуры (→ Arteta) или защите преимущества (→ Compact442). Отличимость: единственный пресет с отдельным «медицинским» триггером входа (усталость), а не игровым состоянием; в v9 получил прямой ребро-переход к Compact442.
- **`Pep_ControlledPush_att3` (controlled_chase, high).** Первая ступень усиления атаки: нужен гол при сохранённой структуре. Входит по `need_goal_or_attack_need`; выходит при восстановлении структуры (→ Arteta), атакующем momentum (→ TwoThreeFive) или открытой ширине (→ Conte). Отличимость: усиление без потери переходной структуры — в отличие от 3-2-5 не имеет жёстких вето и остаётся допустимым при умеренном браке.
- **`Pep_TwoThreeFive_att3` (positional_siege, very_high).** Позиционный дожим 3-2-5: атакующий momentum при контролируемых переходах. Входит по `attacking_momentum`+`transition_control`; выходит при потере momentum (→ ControlledPush), потребности в ширине (→ Conte) или поздней погоне (→ Klopp). Отличимость: единственный осадный формат с жёстким вето при transition threat/fatigue/браке — максимальная атака при строгих условиях допуска.
- **`Conte_WingbackWidth_bal4` (width_attack, high).** Максимальная ширина 3-4-3 через латерали: центр закрыт, фланги дают качество. Входит по `wide_quality`+`center_closed`; выходит при исчерпании ширины (→ Arteta), необходимости гола через центр (→ ControlledPush) или позиционном дожиме (→ TwoThreeFive). Отличимость: единственный пресет с явным `priority: ['left','right']` и cross-каналом как основным оружием; в v9 cross 5→4 отсекает перегенерацию пустых подач.
- **`Klopp_Gegenpress_att4` (late_high_pressure, very_high).** Поздний high-pressure 4-2-4: проигрываем поздно при приемлемой физике и браке. Входит по `late_need_goal`+`fitness`; выходит при стабилизации погони (→ TwoThreeFive), контролируемом push (→ ControlledPush) или финальном окне (→ Bielsa). Отличимость: жёстко ограничен поздней погоней (вето вне `late_high_pressure`/`final_all_in`) и дороговизной (вето по fatigue/браку/удалению).
- **`Simeone_Compact442_def4` (protect_lead, low).** Компактный 4-4-2: защита позднего преимущества. Входит по `protect_lead`; выходит при снятии угрозы (→ Arteta), критической осаде (→ LowBlock) или fatigue прессинга (→ PressCooldown). Отличимость: низкорисковая защита с локальным прессингом; вето «защитный 4-4-2 запрещён при проигрыше» отделяет его от погони.
- **`Simeone_LowBlock_def5` (emergency_lock, very_low).** Временный 5-4-1 emergency lock: критическая осада без выхода или очень поздняя защита. Входит по `mandatory_reassessment_next_window`; выходит при снятии угрозы (→ Compact442) или выходе из lock (→ BoxControl). Отличимость: единственный пресет с обязательной переоценкой следующего окна; в v9 прямое ребро LowBlock→Bielsa отсутствует — emergency lock не может перелиться в final all-in без промежуточной переоценки; в v9 build_fast 2→1 закрепляет минимальный темп.
- **`Bielsa_ChaosPress_att5` (final_all_in, maximum).** Финальный all-in 3-3-4: последнее окно проигрываемого матча. Входит по `emergency_need_goal`; выходит при нерешённом матче (→ Klopp). Отличимость: максимум прессинга/ширины/риска с вето «только финальный all-in» и «дорогой прессинг запрещён по fatigue/браку/удалению»; в v9 cross 5→4 снижает зависимость от навесов в состоянии максимального брака.

## A. Suite inventory

Порядок полей в колонке «Контролы (14)»: `def_line, press_line, def_width, press_intense, build_type, build_temp, build_long, build_fast, style, pass_risk, dribble, cross, corner, shot`.

| Пресет | Роль | Формация | Риск | Контролы (14) | Primary-ситуация | Allowed-ситуации | Условия выхода (roleContracts) |
|---|---|---|---|---|---|---|---|
| `Arteta_Control433_bal3` | stable_control | 4-3-3 | medium | 2/3/2/3/2/2/1/2/3/3/2/2/1/2 | stable_control | — | давление без контрвыхода → BoxControl; нужен гол → ControlledPush; ширина открыта → Conte; защита преимущества → Compact442 |
| `Pep_BoxControl_bal2` | pressure_escape | 4-1-2-2-1 | low | 2/2/2/2/2/1/1/1/3/2/1/1/1/1 | pressure_escape | stable_control | стабилизация → Arteta; fatigue/рост брака → PressCooldown |
| `Pep_PressCooldown_bal2` | press_cooldown | 4-1-4-1 | low | 1/2/3/1/1/2/4/2/2/2/1/2/1/1 | press_cooldown | pressure_escape, stable_control | восстановление → BoxControl; структура готова → Arteta; защита преимущества → Compact442 |
| `Pep_ControlledPush_att3` | controlled_chase | 4-2-3-1 | high | 3/3/2/3/2/3/1/4/4/4/3/2/1/3 | controlled_chase | positional_siege, stable_control | структура восстановлена → Arteta; атакующий momentum → TwoThreeFive; ширина открыта → Conte |
| `Pep_TwoThreeFive_att3` | positional_siege | 3-2-5 | very_high | 4/4/4/4/2/2/1/3/5/4/3/2/1/4 | positional_siege | controlled_chase, late_high_pressure | momentum потерян → ControlledPush; нужна ширина → Conte; поздняя погоня → Klopp |
| `Conte_WingbackWidth_bal4` | width_attack | 3-4-3 | high | 2/2/5/3/3/2/3/3/4/3/4/4/1/2 | width_attack | positional_siege | ширина исчерпана → Arteta; нужен гол через центр → ControlledPush; позиционный дожим → TwoThreeFive |
| `Klopp_Gegenpress_att4` | late_high_pressure | 4-2-4 | very_high | 4/5/3/5/3/3/2/5/5/4/4/3/1/4 | late_high_pressure | final_all_in, positional_siege | погоня стабилизирована → TwoThreeFive; нужен контролируемый push → ControlledPush; финальное окно → Bielsa |
| `Simeone_Compact442_def4` | protect_lead | 4-4-2 | low | 1/2/1/4/1/1/3/2/1/2/1/2/1/1 | protect_lead | emergency_lock, stable_control | угроза снята → Arteta; критическая осада → LowBlock; fatigue прессинга → PressCooldown |
| `Simeone_LowBlock_def5` | emergency_lock | 5-4-1 | very_low | 1/1/1/1/1/1/5/1/1/1/1/1/1/1 | emergency_lock | protect_lead | угроза снята → Compact442; выход из lock → BoxControl |
| `Bielsa_ChaosPress_att5` | final_all_in | 3-3-4 | maximum | 5/5/5/5/3/3/4/5/5/5/5/4/1/5 | final_all_in | late_high_pressure | матч не решён → Klopp |

## B. Pairwise diversity

Метрика: **невзвешенное манхэттенское расстояние** по 14 controlFields (`priority` исключён); источник — сгенерированный `data/tactics/active-preset-inventory-v3.json` (`distanceMetric: unweighted_manhattan`), матрица перепроверена пересчётом из контролов (0 расхождений, 45 пар).

Полная матрица 10×10 (верхний треугольник; порядок — как в реестре):

| | Art | Box | Cool | Push | 325 | Conte | Klopp | Comp | Low | Biel |
|---|---|---|---|---|---|---|---|---|---|---|
| **Arteta** | — | 8 | 13 | 8 | 13 | 13 | 21 | 13 | 20 | 30 |
| **Pep_BoxControl** | | — | 11 | 16 | 21 | 19 | 29 | 11 | 12 | 38 |
| **Pep_PressCooldown** | | | — | 21 | 24 | 18 | 30 | 8 | 9 | 35 |
| **Pep_ControlledPush** | | | | — | 9 | 15 | 13 | 21 | 28 | 22 |
| **Pep_TwoThreeFive** | | | | | — | 16 | 10 | 24 | 33 | 17 |
| **Conte** | | | | | | — | 18 | 20 | 27 | 19 |
| **Klopp** | | | | | | | — | 30 | 39 | 9 |
| **Simeone_Compact442** | | | | | | | | — | 9 | 37 |
| **Simeone_LowBlock** | | | | | | | | | — | 44 |
| **Bielsa** | | | | | | | | | | — |

**Минимальная дистанция: 8** — ровно 3 пары: `[Arteta ↔ Pep_BoxControl]`, `[Arteta ↔ Pep_ControlledPush]`, `[Pep_PressCooldown ↔ Simeone_Compact442]`. Максимальное разделение: 44 (`Simeone_LowBlock ↔ Bielsa`). Средняя дистанция 20.02, медиана 19.

**Гистограмма распределения дистанций (45 пар; биннинг — интервалы шириной 4 по целочисленным значениям, границы включительно: [8–11], [12–15], … [44–47]):**

| Бин | Пар | ASCII |
|---|---|---|
| 8–11 | 10 | ██████████ |
| 12–15 | 7 | ███████ |
| 16–19 | 7 | ███████ |
| 20–23 | 7 | ███████ |
| 24–27 | 3 | ███ |
| 28–31 | 5 | █████ |
| 32–35 | 2 | ██ |
| 36–39 | 3 | ███ |
| 40–43 | 0 | |
| 44–47 | 1 | █ |
| **Σ** | **45** | |

Повольный состав нижних бинов: d=8 ×3, d=9 ×4, d=10 ×1, d=11 ×2; d=12 ×1, d=13 ×5, d=15 ×1; d=16 ×2, d=17 ×1, d=18 ×2, d=19 ×2; d=20 ×2, d=21 ×4, d=22 ×1; d=24 ×2, d=27 ×1.

**5 ближайших пар** (детерминированный порядок `nearestPairs`: по дистанции, затем по id) — и почему каждая является легитимной границей семейства, а не дубликатом:

1. **Arteta ↔ Pep_BoxControl (8).** Граница stable_control ↔ pressure_escape на «контрольном» семействе: одинаковый защитный каркас (def_line 2, def_width 2, style 3), различие — press_line 3↔2, build_temp 2↔1, pass_risk 3↔2 и атакующий минимум BoxControl (dribble/shot 1). Роли разные: фон равного матча против аварийного выхода из давления; ребро Arteta↔BoxControl — рабочая лестница баланса. В v8 эта же пара была минимумом с d=5; v9-дельты (build_fast/dribble/shot BoxControl 2→1) сознательно развели её до 8.
2. **Arteta ↔ Pep_ControlledPush (8).** Граница контроль ↔ погоня: почти одинаковая структура, различие — целиком в форсировании (build_fast 2↔4, build_temp 2↔3, style 3↔4, pass_risk 3↔4, shot 2↔3). Пересечение по защите делает переход между ними дешёвым (один шаг), но роли не пересекаются: базовый план против «нужен гол при сохранённой структуре».
3. **Pep_PressCooldown ↔ Simeone_Compact442 (8).** Две низкорисковые «сберегательные» роли: оба де-эскалируют игру, отсюда близость. Различие — в профиле: cooldown держит ширину и низкий прессинг (def_width 3, press_intense 1, build_long 4), Compact442 — узкий блок с локальным прессингом (def_width 1, press_intense 4). Триггеры входа разные (усталость vs защита преимущества); в v9 между ними добавлено прямое ребро — при fatigue во время защиты лид переходит без промежуточных ступеней.
4. **Bielsa ↔ Klopp (9).** Пара финальной эскалации: обе роли — максимальный прессинг с высокой линией. Bielsa отличается полным all-in профилем (def_width 5, pass_risk 5, dribble 5, shot 5) против «дорогого, но управляемого» Klopp (def_width 3, pass_risk 4). Ребро Klopp→Bielsa — единственный вход в финальное окно; Bielsa жёстко завето-ван вне `final_all_in`, поэтому близость к Klopp — это лестница эскалации, а не дубль.
5. **Pep_ControlledPush ↔ Pep_TwoThreeFive (9).** Две соседние ступени атаки: +1 шаг агрессии по всем осям (def_line 3↔4, press_line 3↔4, def_width 2↔4, style 4↔5). Различие — в условиях допуска: у 3-2-5 жёсткие вето (transition threat/fatigue/брак), у ControlledPush их нет. Близость оправдана: это одна лестница усиления, но разные уровни риска.

*Полный список 45 пар отсортирован в `nearestPairs` инвентаря; кроме пяти перечисленных, на дистанции 9 лежат ещё две пары (`Pep_PressCooldown ↔ Simeone_LowBlock`, `Simeone_Compact442 ↔ Simeone_LowBlock`) — обе являются границей «сбережение → аварийный lock» и разделяются триггерами входа/переоценкой, а не числами контролов.*

**Сравнение с v8:** минимальная дистанция v8 — **5** (`Arteta ↔ Pep_BoxControl`); v9 поднимает минимум до **8** за счёт четырёх контроль-дельт (см. «Suite diff v8 → v9»). Ни одна пара в v9 не опускается ниже 8.

## C. Situation map

Все 10 ситуаций закрыты; **у каждой ситуации ровно один primary-держатель**, а каждая ситуация входит в чей-то primary или allowedSituations — инвариант enforced синк-тулом (`situation is not covered by any active preset` → FAIL) и тестом diversity. Runner-up — второй по `SCORE_BY_SITUATION`.

| Ситуация | Primary (score) | Runner-up (score) | Жёсткие вето | Ожидаемый переход |
|---|---|---|---|---|
| `stable_control` | Arteta (68) | Pep_BoxControl (34) | — | → Pep_BoxControl (давление), → Pep_ControlledPush (нужен гол) |
| `pressure_escape` | Pep_BoxControl (74) | Arteta (36) | — | → Arteta (стабилизация), → Pep_PressCooldown (fatigue) |
| `press_cooldown` | Pep_PressCooldown (76) | Pep_BoxControl (38) | поздний проигрыш требует продвижения, а не cooldown | → Pep_BoxControl (восстановление), → Compact442 (лид) |
| `controlled_chase` | Pep_ControlledPush (72) | Pep_TwoThreeFive (38) | — | → Arteta (структура), → Pep_TwoThreeFive (momentum) |
| `positional_siege` | Pep_TwoThreeFive (74) | Pep_ControlledPush (48) | 3-2-5 запрещён при transition threat/fatigue/браке; позднее преимущество не требует high/all-in риска | → Pep_ControlledPush (momentum потерян), → Klopp (поздняя погоня) |
| `width_attack` | Conte (76) | Pep_ControlledPush (34) | — | → Arteta (ширина исчерпана), → Pep_TwoThreeFive (дожим) |
| `protect_lead` | Simeone_Compact442 (74) | Arteta (48) | защитный 4-4-2 запрещён при проигрыше | → Arteta (угроза снята), → LowBlock (критическая осада) |
| `emergency_lock` | Simeone_LowBlock (84) | Simeone_Compact442 (46) | Low Block только временный emergency lock | → Simeone_Compact442 (угроза снята), → Pep_BoxControl (выход из lock) |
| `late_high_pressure` | Klopp (78) | Pep_ControlledPush (54) | Klopp только поздняя погоня; дорогой прессинг запрещён по fatigue/браку/удалению; позднее преимущество не требует high/all-in риска | → Pep_TwoThreeFive (погоня стабилизирована), → Bielsa (финальное окно) |
| `final_all_in` | Bielsa (90) | Klopp (58) | Bielsa только финальный all-in; дорогой прессинг запрещён; позднее преимущество не требует high/all-in риска | → Klopp (матч не решён) |

Дополнительно: v8-ситуация `pressure_counter` отдельной не существует — выход из давления с подтверждённым outlet классифицируется как `pressure_escape` (покрытие через консервативный ранжинг), и `preferredPreset('pressure_counter')` в v9 возвращает `null`.

## D. Transition graph

Граф переходов STEP v9 (модуль-локален в политике; публично — через `shortestStep()`). Всего **27 направленных рёбер**; из них 3 односторонних (`Pep_PressCooldown→Arteta`, `Simeone_LowBlock→Pep_BoxControl`, `Klopp→Pep_ControlledPush`), остальные 24 двусторонние.

| Из | Рёбра (цели) |
|---|---|
| `Arteta_Control433_bal3` | → Pep_BoxControl, → Pep_ControlledPush, → Conte, → Simeone_Compact442 |
| `Pep_BoxControl_bal2` | → Arteta, → Pep_PressCooldown |
| `Pep_PressCooldown_bal2` | → Pep_BoxControl, → Arteta, → Simeone_Compact442 |
| `Pep_ControlledPush_att3` | → Arteta, → Pep_TwoThreeFive, → Conte |
| `Pep_TwoThreeFive_att3` | → Pep_ControlledPush, → Conte, → Klopp |
| `Conte_WingbackWidth_bal4` | → Arteta, → Pep_ControlledPush, → Pep_TwoThreeFive |
| `Simeone_Compact442_def4` | → Arteta, → Simeone_LowBlock, → Pep_PressCooldown |
| `Simeone_LowBlock_def5` | → Simeone_Compact442, → Pep_BoxControl |
| `Klopp_Gegenpress_att4` | → Pep_TwoThreeFive, → Pep_ControlledPush, → Bielsa |
| `Bielsa_ChaosPress_att5` | → Klopp |

**Явно: ребро `emergency_lock → final_all_in` (Simeone_LowBlock_def5 → Bielsa_ChaosPress_att5) НЕ существует** — аварийный lock не может перелиться в final all-in без промежуточной переоценки; путь из LowBlock в Bielsa идёт через Compact442/Klopp-лестницу (несколько шагов `shortestStep`).

Инварианты, проверяемые `tools/test-tactic-transition-graph.mjs`:

- **Node set:** множество узлов STEP в точности равно 10 активным пресетам.
- **Connectivity:** неориентированный BFS от Arteta достигает всех 10 пресетов; динамическая проверка — повторные шаги `shortestStep` от Arteta приводят к каждой цели за ≤15 хопов.
- **No retired targets:** ни одно ребро не указывает на removed/retired id (`Compact_Counter_def3` и прекон-7 удалённые отсутствуют); `shortestStep` между любыми активными пресетами никогда не возвращает удалённый id.
- **No LowBlock→Bielsa:** прямое ребро отсутствует (assert).
- **No phantom edges:** для каждой не-смежной достижимой пары первый хоп живого `shortestStep` обязан быть реальным ребром зеркала (живой граф не «прыгает» напрямую в цель).
- **Family sanity:** для каждой группы `meta.group` (balance/attack/defensive) BFS только по внутри-групповым рёбрам достигает всех членов группы из любого члена.
- **Guard boundary:** `applyProgressionGuard` пропускает неактивный кандидат без мутации (passthrough, документировано), но `selectRawPreset` никогда не эммитит удалённый пресет (`fallbackReason:'invalid_preset'`).

Отличия от v8-графа, которые ловит тест: в v8 не было рёбер `PressCooldown↔Compact442`, `LowBlock→BoxControl`, `Klopp→ControlledPush`; порядок целей TwoThreeFive был `[ControlledPush, Klopp, Conte]` против v9 `[ControlledPush, Conte, Klopp]`; `shortestStep('Pep_PressCooldown','Simeone_Compact442')` в v8 возвращал `Pep_BoxControl` (первый хоп 3-шагового пути), а не цель.

## Telemetry contract

Поля рекомендации пишутся в три слоя: **effect root** и **`tacticContext`** (в effect-объекте) и **`tacticTelemetry`** (в снапшоте); event-строки `preset_event` несут свои собственные копии (`#252`, single-writer contract).

| Поле | Где пишется | Кто читает |
|---|---|---|
| `recommendedPreset` | policy `stamp()`/`engine.run` (в момент решения); `savePresetEvent`; `buildPresetEffect` (root+tacticContext); `enrich` passthrough (prior wins) | аудит «рекомендовано vs применено», effect-аналитика |
| `rawRecommendedPreset` | `buildPresetEffect`/`enrich` (`action.rawPreset`) | различение raw vs guarded (progression guard) |
| `actualPreset` | `savePresetEvent` (имя применения); `buildPresetEffect` (`pending.presetName \|\| currentPreset`); `enrich` (`currentPreset`) | аудит применения |
| `decisionSituation` | `buildPresetEffect`/`enrich` (`action.decision`) | ситуационные когорты |
| `ruleId` | `enrich` (`action.ruleId`: `suite_v9_<situation>` \| `suite_v9_hold_current`) | атрибуция правила |
| `guardType`, `guardReason` | policy action (`hold_current`, `suite_v9_selection`), `applyProgressionGuard` (`emergency_override`, family step); `enrich`/effect | диагностика гвардов |
| `applicationSource` | `savePresetEvent` → `'preset_apply'`; manual-change watcher → `'manual_change'`; `enrich` passthrough | классификация источника, состояния |
| `fallbackReason` | policy action (`no_eligible_candidate`/`invalid_preset`/`no_decision`); `enrich`/effect | hold-диагностика |
| `recommendationState` | `resolveRecommendationState` на event-строках и effects (root+tacticContext) | когортная аналитика состояний |
| `ruleDecision` (passthrough) | `enrich` (`prior.ruleDecision \|\| snapshot.ruleDecision`) | полный контекст решения в снапшоте |
| `riskAppetite` | policy `currentRisk()`; `enrich` (fallback → `registry.defaultRiskAppetite` `'standard'`) | интерпретация risk-поправки |
| `libraryVersion` | `stamp()`/`enrich` (= `suiteVersion`) | когортный ключ v8/v9 |
| `recommendationSchema` | `stamp()`/`enrich` (= `recommendationSchema`) | когортный ключ схемы |

**Состояния применения (enum `recommendationState`) и семантика:**

| Состояние | Семантика |
|---|---|
| `recommended_and_applied` | рекомендация совпала с применённым пресетом |
| `recommended_not_applied` | рекомендация была, применён другой пресет (пользователь ушёл к B) |
| `manual_override` | рекомендации не было, но пресет применён |
| `fallback_hold` | hold-решение (`action.preset == null`) или prior-состояние `fallback_hold`; имя пресета не подставляется |
| `lab_override` | источник применения `tactical_lab:` / `tactical_lab_rollback:` перекрывает остальные состояния (защитная ветка: Lab применяет через bridge, минуя `savePresetEvent`) |
| `unknown_legacy` | **только read-time** классификация пре-v9 строк; клиентом никогда не пишется |

**Single-writer правило:** `tacticTelemetry` пишется только (а) политикой в момент решения (`stamp()`), (б) `enrich()` — в режиме MERGE, где любое непустое prior-значение выигрывает у null. Все остальные слои (UI, эффекты, аудиты) — потребители. `enrich()` больше не создаёт артефакт `'active_presets_v2_bold_policy_v3'` и не подставляет риск-аппетит `'bold'` по умолчанию.

## Regression coverage

| Тест | Что проверяет |
|---|---|
| `tools/test-tactic-fallback-hold-current.mjs` (новый) | hold-ветку через **реальный closure-путь** (rank → choose → hold) в песочнице с `active: []` и v9-идентичностью; `action.preset/rawPreset == null`, `ruleId 'suite_v9_hold_current'`, `recommendationState 'fallback_hold'`; `preferredPreset` → null для неизвестных/пустых ситуаций; `selectRawPreset` → hold для removed-пресета и отсутствия решения; mixed-stack guard (v8-реестр + v9-политика → политика не устанавливается); `toPlanRows` hold-текст без утечки id; статический guard исходника (в политике нет литералов `|| 'Arteta'`, `find(...Arteta)`, `? 'Arteta`); sanity — нормальные контексты по-прежнему выбирают активный пресет (нет over-holding) |
| `tools/test-tactic-transition-graph.mjs` (новый) | все инварианты графа из раздела D + passthrough guard-границы (см. выше) |
| `tools/test-tactical-situation-diversity.mjs` (обновлён) | v9-идентичность (suiteVersion/schema/fallbackPolicy/defaultRiskAppetite/10 active/10 situations/14 controlFields в порядке); block roleContracts (10 контрактов, `fallbackEligible:false`, controls deep-equal, primarySituation/allowedSituations в реестре); сохранение байтов `HISTORICAL_COMPACT_COUNTER`; v9-таблицу 14 контролов + 10 формаций; `scoreCandidate` parts keys verbatim; 11 селекционных сценариев (10 ситуаций + confirmed-outlet); retirement-пины Compact_Counter (не активен, controls не ретюнятся, отсутствует во всех картах); контракт Tactical Lab v1 P03; subprocess-вызов `sync --check` |
| `tools/test-tactic-telemetry-envelope.mjs` (обновлён) | сценарии `recommended_not_applied` (рекомендован A, пользователь оставил B — состояние на event-строке, root и tacticContext); `fallback_hold` (hold-решение, никакое имя пресета не записывается); `manual_override` (нет решения, пресет применён); `lab_override` (источник `tactical_lab:` перекрывает всё); MERGE-семантику `enrich` (prior `recommendedPreset`/`rawRecommendedPreset` выживают); fallback-классификации `resolveRecommendationState` напрямую (null-preset action → `fallback_hold`, полностью пустой вызов → null) |

**CI-регистрация** (`.github/workflows/quality-integration.yml`): `static-contract-security` — `node --check` (строки 39–42) + исполнения diversity и `sync --check` (65–66); `runtime-tactics` — `node --check` (111–114) + исполнения envelope, diversity, fallback-hold, transition-graph, `sync --check` (154–161). Все гейты входят в агрегатный `ci`-джоб.

## Release impact

- Слияние PR в `main` **автоматически** триггерит SLF Release: patch-бамп из release-манифеста; ручные правки версий запрещены (генерируемые артефакты `releases/latest.user.js`, `releases/latest.meta.js`, `data/version.json` не редактируются).
- Релиз поднимает новую **когортную эпоху v9**: строки телеметрии с `libraryVersion 'slf_tactic_suite_561_v9'` и `recommendationSchema 'slf_rule_decision_v9_tactical_suite'` накапливаются отдельно от v8-легаси.
- Старая телеметрия не переписывается и не перечитывается заново: v8-строки остаются v8-строками.
- Контракт `data/tactics/tactic-evaluation-contract-v2.json` не изменён: `safety.clientDoesNotAutoTrain`, `safety.clientDoesNotAutoApply`, `safety.tacticApplicationRemainsManual`, `safety.promotionRequiresHumanApproval` — все `true`; `autoApply:false` в политике.

## Post-release observation plan

1. **Накопление чистой v9-когорты.** После мерджа v9-строки (`libraryVersion 'slf_tactic_suite_561_v9'`) копятся без смешения; любые v8-строки, дошедшие по runtime, классифицируются read-time как `unknown_legacy` и не участвуют в v9-выводах.
2. **Раздельный аудит когорт.** В последующих аудитах v8-legacy и v9-current анализируются раздельно; сравнение долей `fallback_hold`/`recommended_and_applied`/`recommended_not_applied`/`manual_override` — только внутри когорты.
3. **Без ранжирования до готовности.** Никакого Bayesian/champion-ранжирования, пока не накоплена чистая v9-когорта и не выполнены readiness-критерии #252; `boundedEvidenceAdjustment` остаётся 0.
4. **Ре-аудит #252** сравнивает когорты раздельно и оценивает: долю hold-состояний без подмены пресетом, отсутствие контаминации `fallbackApplied`, стабильность инвентаря (sync --check в CI), покрытие ситуаций.

## Deferred until evidence readiness

Следующие возможности сознательно отложены до накопления чистой v9-когорты (в порядке зависимостей):

- **`boundedEvidenceAdjustment > 0`** — включение ненулевой evidence-поправки в ранжировании (сейчас `evidenceAdjustment()` — bounded noop, `return 0`).
- **Ненулевой `contextFit`** — вторая компонента score-частей, зарезервирована и всегда 0.
- **Evidence-aware ranking** — учёт накопленной evidence в порядке кандидатов.
- **Champion/challenger promotion** — продуманная ротация пресетов на основе evidence (требует `promotionRequiresHumanApproval: true` — флаг контракта не меняется).
- **Preset auto-mutation** — автоматическая перегенерация контролов пресетов по данным (сейчас контролы меняются только явными версионными изменениями реестра + синк-тул).

Каждый пункт требует отдельного исходного решения/одобрения; все они закрыты текущим контрактом (`evidenceAdjustment() === 0`, `autoApply:false`, safety-флаги `true`).
