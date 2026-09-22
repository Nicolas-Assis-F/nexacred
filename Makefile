.PHONY: up down logs install test lint typecheck migrate seed
up:
	docker compose up --build
down:
	docker compose down
logs:
	docker compose logs -f
install:
	pnpm install
test:
	pnpm test
lint:
	pnpm lint
typecheck:
	pnpm typecheck
migrate:
	pnpm db:migrate
seed:
	pnpm db:seed
