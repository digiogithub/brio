SHELL := /usr/bin/env bash

# Docker image coordinates
REGISTRY ?= ghcr.io
OWNER ?= digiogithub
IMAGE_NAME ?= brio
IMAGE ?= $(REGISTRY)/$(OWNER)/$(IMAGE_NAME)

# Tags
TAG ?= latest
VERSION_TAG ?= $(shell tag=$$(git describe --tags --abbrev=0 --match 'brio-*' 2>/dev/null || git tag --list 'brio-*' --sort=-creatordate | head -n 1); if [ -n "$$tag" ]; then echo "$$tag"; else echo "latest"; fi)

# Build settings
DOCKERFILE ?= Dockerfile
CONTEXT ?= .
CONTAINER_NAME ?= brio
PORT ?= 8055
BUN_INSTALL_FLAGS ?=

.PHONY: help docker-build docker-build-version docker-tag-version docker-run docker-stop docker-rm docker-login docker-push docker-push-version docker-push-all

help:
	@echo "Available targets:"
	@echo "  make docker-build         Build $(IMAGE):$(TAG)"
	@echo "  make docker-build-version Build $(IMAGE):$(VERSION_TAG)"
	@echo "  make docker-tag-version   Tag latest image as $(VERSION_TAG)"
	@echo "  Optional: BUN_INSTALL_FLAGS=--frozen-lockfile for strict CI installs"
	@echo "  make docker-run           Run container exposing $(PORT):8055"
	@echo "  make docker-stop          Stop running container"
	@echo "  make docker-rm            Remove container"
	@echo "  make docker-login         Login to GHCR (uses GHCR_USER + GHCR_TOKEN)"
	@echo "  make docker-push          Push $(IMAGE):$(TAG)"
	@echo "  make docker-push-version  Push $(IMAGE):$(VERSION_TAG)"
	@echo "  make docker-push-all      Push both latest and version tag"

docker-build:
	docker build \
		-f $(DOCKERFILE) \
		--build-arg BUN_INSTALL_FLAGS="$(BUN_INSTALL_FLAGS)" \
		-t $(IMAGE):$(TAG) \
		$(CONTEXT)

docker-build-version:
	docker build \
		-f $(DOCKERFILE) \
		--build-arg BUN_INSTALL_FLAGS="$(BUN_INSTALL_FLAGS)" \
		-t $(IMAGE):$(VERSION_TAG) \
		$(CONTEXT)

docker-tag-version:
	docker tag $(IMAGE):$(TAG) $(IMAGE):$(VERSION_TAG)

docker-run:
	docker run --rm -d \
		--name $(CONTAINER_NAME) \
		-p $(PORT):8055 \
		$(IMAGE):$(TAG)

docker-stop:
	- docker stop $(CONTAINER_NAME)

docker-rm:
	- docker rm -f $(CONTAINER_NAME)

docker-login:
	@if [[ -z "$$GHCR_USER" || -z "$$GHCR_TOKEN" ]]; then \
		echo "GHCR_USER and GHCR_TOKEN are required"; \
		exit 1; \
	fi
	@echo "$$GHCR_TOKEN" | docker login ghcr.io -u "$$GHCR_USER" --password-stdin

docker-push:
	docker push $(IMAGE):$(TAG)

docker-push-version:
	docker push $(IMAGE):$(VERSION_TAG)

docker-push-all: docker-build docker-tag-version docker-push docker-push-version
