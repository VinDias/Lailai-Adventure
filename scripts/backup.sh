#!/bin/bash

# Script de Backup Profissional Loreflux
DATE=$(date +%F)
BACKUP_DIR="/home/backups"
APP_DIR=$(pwd) # Assume o diretório atual como raiz do app

mkdir -p $BACKUP_DIR

echo "Iniciando backup em $DATE..."

# Compacta a pasta do app excluindo node_modules para otimizar espaço
tar --exclude='node_modules' -czf $BACKUP_DIR/loreflux-$DATE.tar.gz $APP_DIR

# Remove backups com mais de 7 dias
find $BACKUP_DIR -type f -name "loreflux-*.tar.gz" -mtime +7 -delete

echo "Backup concluído com sucesso em $BACKUP_DIR/loreflux-$DATE.tar.gz"