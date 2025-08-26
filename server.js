const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/api/questions', (req, res) => {
    fs.readFile('/var/www/html/data/questions.json', (err, data) => {
        if (err) return res.status(500).send('Ошибка чтения');
        res.json(JSON.parse(data));
    });
});

app.post('/api/questions', (req, res) => {
    fs.readFile('/var/www/html/data/questions.json', (err, data) => {
        if (err) return res.status(500).send('Ошибка чтения');
        const questions = JSON.parse(data);
        questions.push(req.body);
        fs.writeFile('/var/www/html/data/questions.json', JSON.stringify(questions), (err) => {
            if (err) return res.status(500).send('Ошибка записи');
            res.send('Вопрос добавлен');
        });
    });
});

app.listen(3000, () => console.log('Сервер запущен на порту 3000'));
