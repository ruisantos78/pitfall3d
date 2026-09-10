.PHONY: all run start dev install build preview deploy publish clean help

PORT ?= 5173
HOST ?= 0.0.0.0
REGISTRY ?= git.rscs.pt
REGISTRY_USER ?= ruisantos
IMAGE ?= $(REGISTRY)/ruisantos/pitfall
HOST_OS ?= $(shell uname -s)
HOST_ARCH ?= $(shell uname -m)
REGISTRY_TOKEN ?= $(GITEA_TOKEN)

ifneq ($(filter arm64 aarch64,$(HOST_ARCH)),)
  PLATFORM ?= linux/arm64
  TAG ?= arm64
else
  PLATFORM ?= linux/amd64
  TAG ?= latest
endif

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

## publish: Construir e publicar a imagem Docker no package registry do Gitea
publish:
	@echo "🔨 Construindo imagem $(IMAGE):$(TAG) para $(PLATFORM) ($(HOST_OS)/$(HOST_ARCH))..."
	docker build --platform $(PLATFORM) --tag $(IMAGE):$(TAG) .
	@if [ -n "$(REGISTRY_TOKEN)" ]; then \
		echo "🔐 Autenticando no registry $(REGISTRY)..."; \
		printf '%s' "$(REGISTRY_TOKEN)" | docker login $(REGISTRY) --username "$(REGISTRY_USER)" --password-stdin; \
	else \
		echo "ℹ️ Usando as credenciais Docker já configuradas para $(REGISTRY)."; \
	fi
	docker push $(IMAGE):$(TAG)
	@echo "✅ Publicado em https://git.rscs.pt/ruisantos/pitfall/packages"

## clean: Limpar a pasta de build (dist)
clean:
	@echo "🧹 Limpando arquivos de build..."
	rm -rf dist

## help: Exibir esta mensagem de ajuda
help:
	@echo "Comandos disponíveis no Makefile:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed -e 's/## /  make /'
