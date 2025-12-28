# инициализировать репозиторий (если ещё не инициализирован)
git init

# добавить все файлы и закоммитить
git add .
git commit -m "Initial commit"

# добавить удалённый репозиторий (замените URL на корректный)
git remote add origin https://github.com/PlumGame/plummafiozi.git

# переименовать ветку в main (если нужно)
git branch -M main

# отправить на GitHub
git push -u origin main
