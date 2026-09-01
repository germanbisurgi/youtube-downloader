# file generated with AI assistance: Claude Code - 2026-09-01 13:57:50 UTC

# Help based on https://gist.github.com/prwhite/8168133 thanks to @nowox and @prwhite
# And add help text after each target name starting with '\#\#'
# A category can be added with @category

HELP_FUN = \
		%help; \
		while(<>) { push @{$$help{$$2 // 'options'}}, [$$1, $$3] if /^([\w-]+)\s*:.*\#\#(?:@([\w-]+))?\s(.*)$$/ }; \
		print "\nusage: make [target ...]\n\n"; \
	for (keys %help) { \
		print "$$_:\n"; \
		for (@{$$help{$$_}}) { \
			$$sep = "." x (25 - length $$_->[0]); \
			print "  $$_->[0]$$sep$$_->[1]\n"; \
		} \
		print "\n"; }

.PHONY: help install dev mcp lint test build-mac build-linux build-win build-all clean

.DEFAULT_GOAL := help

help: ##@system show this help
	@perl -e '$(HELP_FUN)' $(MAKEFILE_LIST)

install: ##@setup install yarn dependencies
	yarn install

dev: install ##@run launch the Electron app
	yarn dev

mcp: install ##@run launch the MCP server (stdio transport, for use from an MCP client)
	yarn mcp

lint: install ##@quality lint + autofix ./src/frontend
	yarn eslint

test: ##@quality there is no test suite in this project
	@echo "no test suite"

build-mac: install ##@build package for macOS (dmg)
	yarn build-mac

build-linux: install ##@build package for Linux (deb)
	yarn build-linux

build-win: install ##@build package for Windows (nsis)
	yarn build-win

build-all: install ##@build package for macOS, Linux and Windows
	yarn build-all

clean: ##@system remove node_modules and dist
	rm -rf node_modules dist
