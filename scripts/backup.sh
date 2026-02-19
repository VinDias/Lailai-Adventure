
#!/bin/bash
# Script de Backup LaiLai Professional
DATE=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_DIR="backups"

echo "Iniciando backup em $DATE..."

# Criar pasta de backup se não existir
mkdir -p $BACKUP_DIR

# Compactar uploads e sql
tar -czf $BACKUP_DIR/backup-$DATE.tar.gz uploads database.sql 2>/dev/null

if [ $? -eq 0 ]; then
    echo "Backup concluído com sucesso: $BACKUP_DIR/backup-$DATE.tar.gz"
else
    echo "Erro ao realizar backup."
    exit 1
fi
