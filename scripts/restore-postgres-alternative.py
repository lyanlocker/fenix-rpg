#!/usr/bin/env python3
"""Restore a migration package to an EMPTY alternative database only.
Requires FENIX_ALTERNATIVE_DATABASE_URL. Never points the live website here.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from prepare_postgres_migration import run, TABLES, database_environment

def restore(directory):
    env = database_environment("FENIX_ALTERNATIVE_DATABASE_URL")
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("format") != 1 or manifest.get("tables") != TABLES:
        raise RuntimeError("Pacote incompatível.")
    for name in ("shared.dump", "functions.sql"):
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != manifest["checksums"][name]:
            raise RuntimeError("Checksum inválido.")
    occupied = run(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c",
        "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f');"], env).strip()
    if occupied != "0":
        raise RuntimeError("O banco alternativo precisa estar vazio; nada foi substituído.")
    bootstrap = """create schema if not exists extensions;
      create extension if not exists pgcrypto with schema extensions;
      do $$ begin if to_regprocedure('extensions.digest(text,text)') is null then
        raise exception 'pgcrypto precisa estar no schema extensions'; end if; end $$;"""
    run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-c", bootstrap], env)
    run(["pg_restore", "--no-owner", "--no-acl", "--single-transaction", "--dbname", env["PGDATABASE"],
         str(directory / "shared.dump")], {**env})
    run(["psql", "-X", "-1", "-v", "ON_ERROR_STOP=1", "-f", str(directory / "functions.sql")], env)
    print("Restauração concluída no banco alternativo. Execute tests/sync.sql e tests/shared-combat.sql antes de qualquer troca do site.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    try:
        restore(parser.parse_args().directory)
    except (RuntimeError, OSError, ValueError, KeyError):
        print("Restauração interrompida; confira pacote, conexão e destino vazio (detalhes de conexão omitidos).", file=sys.stderr)
        sys.exit(1)
