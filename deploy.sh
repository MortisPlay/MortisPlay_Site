#!/bin/bash
cd /var/www/mortisplay.ru || exit
git reset --hard
git pull origin main
chown -R www-data:www-data /var/www/mortisplay.ru
