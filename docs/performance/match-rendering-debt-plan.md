# План погашения техдолга: bootstrap и 2D-матч

## Цель

Снизить вероятность полного отказа userscript из-за необязательных compatibility patches, отделить структурный рефакторинг от изменения поведения 2D-матча и получить воспроизводимые данные о микрофризах до дальнейшей оптимизации.

## Зафиксированные инварианты

- `App.start()` вызывается ровно один раз.
- Ошибка header, match-rendering или tactics-dropdown adapter не должна блокировать `App.start()`.
- Поле остаётся 800×550 CSS px.
- Canvas backing bitmap после установки hooks остаётся 800×550.
- Render scale ограничен значением `1`.
- Повторный host resize или `set_render_scale(9)` не должен вызывать повторную reallocation.
- Match UI observer не реагирует на произвольные frame-marker mutations внутри поля.
- Диагностика не выполняет сетевые запросы, не пишет в storage и не меняет host rendering methods.

## Этапы

### 0. Baseline и release consistency

Проверяются текущий `main`, release artifact, bundle order, bootstrap call graph, ручная telemetry workflow, VPS storage и CI. Результат этапа — список подтверждённых инвариантов и непроверенных production-фактов.

Статус: выполнено до начала изменений.

### 1. Bootstrap risk boundary

Добавляется отдельный quality gate, который:

- запрещает возврат известного fatal-pattern `compactSnapshotForStorage.bind` до `App.start()`;
- фиксирует текущий allowlist compatibility `.bind(...)`;
- проверяет единственный вызов `App.start()`;
- проверяет порядок compatibility adapters;
- исполняет fail-open runner в `vm` с успешным и аварийным adapter.

Rollback: удалить test/workflow commit; runtime не меняется.

### 2. Логическая изоляция compatibility adapters

Header layout, match rendering и tactics dropdown оформляются как отдельные owners внутри `src/app/bootstrap.js`. Все три запускаются только через `runCompatibilityAdapter()`.

Это промежуточная миграция: поведение сохраняется, но исключение в одном adapter больше не останавливает остальные adapters и `App.start()`.

Rollback: один commit с восстановлением прежней top-level структуры.

### 3. Поведенческая эквивалентность

Существующие exact-artifact и Playwright tests обязаны подтвердить:

- синтаксически валидный собранный userscript;
- прежнюю геометрию 800×550;
- render scale `1`;
- одну первоначальную canvas reallocation и отсутствие повторных reallocations;
- восстановление геометрии после host `game2dSetFieldSize()`;
- отсутствие UI remount от произвольных изменений внутри поля.

Никакая performance-гипотеза не считается подтверждённой только на основании synthetic fixture.

### 4. Read-only production diagnostics

`tools/match-rendering-diagnostics.js` запускается вручную в DevTools на реальном `game.php`. Инструмент собирает:

- RAF frame deltas: median, p95, p99 и max;
- количество gaps более 40, 50 и 100 ms;
- Long Tasks, если API поддерживается браузером;
- Canvas bitmap/CSS размеры и изменения состояния;
- DPR, viewport и visibility transitions;
- SLF render markers и match observer runs.

Инструмент не входит в userscript bundle и не отправляет данные на VPS.

#### Запуск

1. Открыть реальный матч и DevTools Console.
2. При необходимости задать длительность:

```js
window.SLF_MATCH_DIAGNOSTICS_OPTIONS = { durationMs: 30000 };
```

3. Выполнить содержимое `tools/match-rendering-diagnostics.js`.
4. В течение capture window воспроизвести проблемный участок матча.
5. После завершения сохранить отчёт:

```js
copy(JSON.stringify(window.__SLF_MATCH_RENDER_DIAGNOSTICS_REPORT__, null, 2));
```

Досрочная остановка:

```js
window.__SLF_MATCH_RENDER_DIAGNOSTICS_STOP__?.();
```

#### Матрица измерений

Минимум три capture на один сценарий:

- SLF включён, стандартный zoom;
- SLF выключен, тот же матч и настройки;
- SLF включён после контролируемого отключения конкретного performance patch.

Отдельно фиксируются browser version, OS, GPU, viewport, DPR и zoom. Hidden/background tab не используется для сравнения RAF.

#### Оффлайн-сравнение серий

После сохранения отчётов заполнить копию `docs/performance/match-rendering-trace-matrix.example.json`. Пути в `reports` задаются относительно файла матрицы. В каждой группе должны быть минимум три отчёта одного сценария.

Запуск:

```bash
node tools/compare-match-rendering-traces.mjs path/to/matrix.json
```

Машиночитаемый вывод:

```bash
node tools/compare-match-rendering-traces.mjs path/to/matrix.json --json
```

Анализатор:

- проверяет схему каждого capture;
- требует одинаковые DPR и viewport между сравниваемыми сериями;
- отклоняет capture с переходом вкладки в hidden/background state;
- предупреждает, если длительности capture отличаются более чем на 25%;
- нормализует frame gaps на 1000 RAF samples;
- нормализует Long Tasks и observer runs по длительности capture;
- рассчитывает абсолютную и процентную разницу относительно baseline;
- отдельно оценивает render scale, hook readiness и Canvas state changes для условий с SLF.

Код возврата `2` означает, что отчёты прочитаны, но матрица несопоставима. Код возврата `1` означает ошибку схемы, файла или структуры матрицы. Предварительные threshold checks являются только сигналом для расследования и не блокируют merge.

Сырые отчёты не должны содержать токены, cookies, приватные сообщения или другие персональные данные. В репозиторий добавляется только обезличенная evidence при отдельном review.

#### Предварительные цели

До получения трёх production traces эти значения являются ориентирами, а не merge gate:

- `canvas.stateChangeCount = 0` после готовности hooks;
- `slf.renderScale = "1"`;
- p95 frame delta не выше 33.4 ms;
- p99 frame delta не выше 50 ms;
- gaps более 100 ms отсутствуют в активной вкладке.

### 5. Контролируемые эксперименты

Каждая гипотеза проверяется отдельным маленьким изменением:

1. host simulation/render loop;
2. периодические host callbacks/AJAX;
3. main-thread Long Tasks;
4. GC/allocation pressure;
5. compositor/filter/transform layers;
6. SLF UI remount cost;
7. startup polling и повторная установка hooks.

Для эксперимента обязательны baseline trace, changed trace, rollback и одинаковая test matrix.

### 6. Минимальный measured fix

Runtime fix допускается только после trace evidence. Приоритет:

1. устранить повторную работу или reallocation;
2. ограничить тяжёлый callback;
3. убрать лишний compositor layer;
4. только затем рассматривать pacing/caching/adaptive quality.

Запрещено менять host simulation timing без отдельной проверки корректности матча.

### 7. Физический split bundle modules

После стабилизации fail-open boundary compatibility owners переносятся из `bootstrap.js` в отдельные source files. Этот этап выполняется отдельным PR, потому что требует согласованного изменения:

- `src/app/bundle-order.json`;
- `dependencyAudit.expectedModuleCount` и module metadata;
- runtime reachability review;
- exact release markers;
- browser and quality integration gates.

`src/app/bootstrap.js` должен остаться последним bundle module и владеть только orchestration/App startup.

### 8. Storage/API debt

Отдельная очередь, не смешиваемая с rendering PR:

- определить обязательность unique keys для новых telemetry rows;
- сохранить backward compatibility для исторических rows;
- проверить worker/process locking model;
- получить production evidence для manual `preset_event → preset_effect`;
- зафиксировать deployed VPS SHA и API health evidence.

## Merge policy

PR не переводится из draft и не объединяется, пока обязательные GitHub Actions не завершились успешно. Synthetic browser success подтверждает contract compatibility, но не заменяет production performance trace.
