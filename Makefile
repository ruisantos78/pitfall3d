.PHONY: all run start dev install build preview deploy clean help

PORT ?= 5173
HOST ?= 0.0.0.0

# Default target: launch the game
all: run

## install: Install all dependencies (npm install)
install:
	@echo "📦 Instalando dependências do projeto..."
	npm install

## run: Iniciar o jogo no servidor de desenvolvimento (alias: start, dev)
run: dev

start: dev

dev:
	@echo "=================================================="
	@echo "  🕹️  INICIANDO ATARI PITFALL 3D (FPS EDITION)   "
	@echo "=================================================="
	@echo "Abrindo em: http://localhost:$(PORT)/"
	@which xdg-open > /dev/null 2>&1 && (sleep 1 && xdg-open http://localhost:$(PORT) > /dev/null 2>&1 &) || true
	npx vite --port $(PORT) --host

## build: Gerar os arquivos otimizados para produção
build:
	@echo "🔨 Gerando build de produção..."
	npm run build

## preview: Testar a versão de produção localmente
preview:
	@echo "👀 Visualizando build de produção..."
	npm run preview

## deploy: Gerar um arquivo HTML único e 100% autônomo (standalone) para executar o jogo diretamente
deploy:
	@echo "🚀 Empacotando jogo em HTML único autônomo..."
	npm run deploy

## clean: Limpar a pasta de build (dist)
clean:
	@echo "🧹 Limpando arquivos de build..."
	rm -rf dist

## help: Exibir esta mensagem de ajuda
help:
	@echo "Comandos disponíveis no Makefile:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed -e 's/## /  make /'
