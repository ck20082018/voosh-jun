# Совместная разработка двух человек

`main` — общая проверенная версия. Каждая задача имеет временную ветку `visual/<задача>` или `logic/<задача>` и Pull Request (PR) в main. После объединения удаляем завершённую ветку. Следующую задачу начинаем от актуальной main. Не держим две постоянно расходящиеся ветки оформления и логики.

## Кто где работает

Друг отвечает за `src/style.css`, `src/classic.css`, `src/presentation/**` и будущие `public/assets/**`. Автор отвечает за ядро, сценарии, ноды: `core.ts`, `level.ts`, `compiler.ts`, `validation.ts`, `storage.ts`, `connections.ts`, `editorFlow.ts`, `production.ts` и соответствующие тесты.

React-интерфейсы App, GraphEditor, ConnectionBuilder, адаптер Workshop, точки входа, исходная сцена classic, интеграционные UI-тесты, зависимости, конфигурация и документация общие. Перед параллельной правкой общего файла договоритесь, кто меняет какую часть; перечислите изменения в PR. Границы — правила команды, не ограничение доступа. Подробности в [AGENTS.md](../AGENTS.md) и [инструкциях отрисовки](../src/presentation/AGENTS.md).

## Слова Git

- **clone** — получить репозиторий с историей на свой компьютер.
- **branch** — отдельная линия работы над задачей.
- **commit** — сохранить выбранные изменения в локальную историю с пояснением.
- **push** — отправить локальные коммиты на GitHub.
- **pull** — получить и включить новые коммиты удалённой ветки.
- **Pull Request** — предложение объединить ветку; другой человек читает diff, CI проверяет код, затем разрешённый участник объединяет изменения.

## Первый запуск

Владелец открывает GitHub → репозиторий → Settings → Collaborators → Add people, вводит настоящий GitHub-логин друга. Друг принимает приглашение. Никто не приглашён автоматически. [Инструкция GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository).

Установите Git и Docker Desktop либо Node.js 26. Для приватного репозитория используйте свой вход в GitHub; пароль аккаунта для HTTPS Git не подходит — используйте credential manager/токен или настроенный SSH. Не храните токены в проекте.

```sh
git clone https://github.com/ck20082018/voosh-jun.git
cd voosh-jun
docker compose up --build -d
```

Откройте http://localhost:8081. Для быстрой локальной разработки:

```sh
npm ci
npm run dev
```

Docker пересобирают после изменения исходников; Vite обновляет страницу автоматически. Полные инструкции и создание уровней — в [README](../README.md).

## Начать задачу

Сначала `git status`: если есть незавершённая работа, сохраните её в своей ветке отдельным коммитом, не стирайте её. Следующие команды предполагают чистое рабочее дерево:

```sh
git switch main
git pull --ff-only origin main
git switch -c visual/workshop-colors
```

Для логики вместо последней команды: `git switch -c logic/new-scenario`. Названия задач выбирайте разные. Если pull сообщает о расхождении, остановитесь и разберите историю вместе; не сбрасывайте чужие коммиты.

## Проверить и отправить

```sh
git status
git diff
npm test
npm run build
# Пример: добавляем только файлы своей задачи:
git add src/presentation/workshopDrawing.ts src/style.css
git diff --cached
git commit -m "visual: improve workshop colors"
git push -u origin visual/workshop-colors
```

Для другой задачи замените пути и имя ветки. `git diff` показывает ещё не добавленные изменения; `git diff --cached` — содержимое будущего коммита. Не используйте `git add .` без просмотра списка. Исправьте проваленные проверки перед PR.

На GitHub откройте Pull requests → New pull request. Выберите base: `main`, compare: свою ветку. Посмотрите Files changed, нажмите Create pull request. Опишите проблему, изменения общих файлов и реально выполненные проверки. Попросите коллегу посмотреть PR. После успешного CI и проверки объедините через Merge pull request; нажмите Delete branch. На компьютере с чистым рабочим деревом:

```sh
git switch main
git pull --ff-only origin main
git branch -d visual/workshop-colors
```

## Получить новые изменения во время задачи

Находясь в своей рабочей ветке с чистым деревом:

```sh
git fetch origin
git merge origin/main
npm test
npm run build
git push
```

Это включает изменения коллеги в текущую задачу без переписывания истории. Force push не нужен.

При конфликте `git status` перечислит файлы. Откройте каждый: блоки `<<<<<<<`, `=======`, `>>>>>>>` показывают версии. Разберитесь в обеих правках и вручную составьте правильный результат; не выбирайте одну сторону сразу для всех файлов. Удалите маркеры, проверьте поведение и завершите merge:

```sh
git add src/Workshop.tsx
# Добавьте также остальные разрешённые конфликтные файлы.
git diff --cached
npm test
npm run build
git commit
git push
```

Если ещё не готовы разбирать конфликт, отмените только незавершённое объединение: `git merge --abort`. Поэтому перед merge нужно чистое дерево. Если проверка после merge провалилась, исправьте причину до отправки.

## CI и защита main

Workflow `.github/workflows/ci.yml` запускается для PR в main и push в main: Node.js 26, `npm ci`, `npm test`, `npm run build`. Права только чтения содержимого. Сборка включает проверку TypeScript.

Защита main этой подготовкой **не включается**. После первого успешного CI владелец открывает Settings → Branches → Add branch protection rule, шаблон `main`. Включите Require a pull request before merging и Require status checks to pass before merging, выберите появившуюся проверку `tests-and-build`. Для двух человек можно потребовать одно одобрение. При желании потребуйте обновление ветки перед объединением; не разрешайте force push или удаление main. Сохраните правило. Доступность защиты приватного репозитория зависит от плана GitHub. [Настройка правила](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule).

## Стартовые промпты Codex

Другу:

> Прочитай AGENTS.md, src/presentation/AGENTS.md и docs/COLLABORATION.md. Проверь ветку и незакоммиченные изменения. Создай visual/<задача> от актуальной main. Задача: [описание оформления]. Работай в области оформления; общие файлы меняй минимально и явно укажи в PR. Сохрани производственную логику, формат данных и совпадение изображения с зонами клика. Выполни тесты и сборку, сообщи реальные проверки.

Автору:

> Прочитай AGENTS.md и docs/COLLABORATION.md. Проверь ветку и незакоммиченные изменения. Создай logic/<задача> от актуальной main. Задача: [описание поведения]. Работай с ядром, сценариями и нодами; сохрани проверки команд и независимость от React/Phaser/DOM. Не меняй оформление попутно. Добавь необходимые проверки поведения, выполни тесты и сборку; перечисли общие файлы в PR.
