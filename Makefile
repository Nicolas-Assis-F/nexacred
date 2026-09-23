.PHONY: up start stop down logs ps rebuild reset whatsapp whatsapp-logs install test lint typecheck migrate seed help

help: ## Mostra os comandos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Sobe toda a stack (build + start) em primeiro plano
	docker compose up --build

start: ## Sobe toda a stack em segundo plano (build + start -d)
	docker compose up --build -d
	@echo "\nNexaCred no ar:"
	@echo "  Painel : http://localhost:$${WEB_PORT:-3000}"
	@echo "  API    : http://localhost:$${API_PORT:-3001}/docs"
	@echo "  Login  : admin@nexacred.local / DevOnly-ChangeMe123!"

stop: ## Para os serviços sem apagar dados
	docker compose stop

down: ## Derruba a stack (mantém volumes/dados)
	docker compose down

logs: ## Acompanha os logs de todos os serviços
	docker compose logs -f

ps: ## Lista o estado dos serviços
	docker compose ps

rebuild: ## Reconstrói as imagens e reinicia (após mudar o código)
	docker compose up --build -d

reset: ## APAGA TODOS OS DADOS (volumes) e sobe do zero
	docker compose down -v
	docker compose up --build -d

whatsapp: ## Reinicia o laboratório WhatsApp (após configurar WHATSAPP_TEST_NUMBERS no .env)
	docker compose up --build -d whatsapp-lab
	@echo "Laboratório WhatsApp reiniciado. Abra o painel em Laboratório para ler o QR Code."

whatsapp-logs: ## Acompanha os logs do laboratório WhatsApp
	docker compose logs -f whatsapp-lab

install: ## Instala dependências localmente (pnpm)
	pnpm install

test: ## Roda os testes unitários
	pnpm test

lint: ## Roda o lint
	pnpm lint

typecheck: ## Roda o typecheck
	pnpm typecheck

migrate: ## Aplica as migrations do banco
	pnpm db:migrate

seed: ## Popula dados de demonstração
	pnpm db:seed
