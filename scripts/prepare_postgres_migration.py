#!/usr/bin/env python3
"""Export the active shared-link backend without touching production data.

Requires PostgreSQL 17+ client utilities. FENIX_SOURCE_DATABASE_URL is read
from the environment and passed through libpq environment variables, never command arguments.
The resulting directory is private and must not be committed or published.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlparse, unquote, parse_qs

TABLES = ["fenix_shared_agents", "fenix_shared_rolls", "fenix_alternate_edits",
          "fenix_infections", "fenix_combat_rooms", "fenix_combat_members"]
SIGNATURES = [
    "fenix_publish_agent(jsonb,text,text)", "fenix_load_shared_agent(uuid,text)",
    "fenix_save_shared_agent(uuid,text,jsonb)",
    "fenix_roll_shared(uuid,text,text,text,integer,integer,text)",
    "fenix_update_infection(uuid,text,text,integer)",
    "fenix_save_combat(uuid,text,jsonb,integer,jsonb)",
    "fenix_load_master_combat(uuid,text)", "fenix_load_player_combat(uuid,text)",
    "fenix_clear_combat(uuid,text,uuid)", "fenix_combat_initiative(uuid,text,uuid,integer)",
    "fenix_adjust_combat_hp(uuid,text,uuid,uuid,integer)",
    "fenix_sync_shared_agent(uuid,text,jsonb,boolean)",
    "fenix_sync_master_combat(uuid,text,text)", "fenix_sync_player_combat(uuid,text,text)",
]

def run(command, env):
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if result.returncode:
        # Database clients can include credentials in connection errors.
        raise RuntimeError(f"{command[0]} falhou; confira a conexão e as permissões (detalhes omitidos).")
    return result.stdout

def database_environment(variable):
    source = os.environ.get(variable)
    if not source:
        raise RuntimeError("Configure " + variable + " no ambiente.")
    value = urlparse(source)
    if value.scheme not in ("postgres", "postgresql") or not value.hostname or not value.path.strip("/"):
        raise RuntimeError("Conexão PostgreSQL inválida.")
    env = {**os.environ, "PGHOST": value.hostname, "PGPORT": str(value.port or 5432),
           "PGUSER": unquote(value.username or ""), "PGPASSWORD": unquote(value.password or ""),
           "PGDATABASE": unquote(value.path.lstrip("/")), "PGSSLMODE": "require"}
    settings = {"sslmode": "PGSSLMODE", "channel_binding": "PGCHANNELBINDING", "connect_timeout": "PGCONNECT_TIMEOUT"}
    for name, values in parse_qs(value.query).items():
        if name not in settings:
            raise RuntimeError("Opção de conexão não suportada; use sslmode, channel_binding e connect_timeout.")
        env[settings[name]] = values[-1]
    return env

def export(destination):
    env = database_environment("FENIX_SOURCE_DATABASE_URL")
    for program in ("psql", "pg_dump", "pg_restore"):
        if not shutil.which(program):
            raise RuntimeError(f"Instale os utilitários PostgreSQL 17+: {program} não encontrado.")
    env["PGOPTIONS"] = "-c default_transaction_read_only=on"
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    names = ",".join("'public." + name + "'" for name in SIGNATURES)
    query = f"""select coalesce(json_agg(json_build_object(
        'signature', signature, 'definition', pg_get_functiondef(signature::regprocedure))), '[]'::json)
        from unnest(array[{names}]) signature;"""
    functions = json.loads(run(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", query], env))
    if len(functions) != len(SIGNATURES):
        raise RuntimeError("Conjunto de funções incompleto.")
    ddl = "\n".join(f["definition"] + ";\nREVOKE ALL ON FUNCTION " + f["signature"] + " FROM PUBLIC;\n" for f in functions)
    (destination / "functions.sql").write_text(ddl)
    args = ["pg_dump", "--format=custom", "--no-owner", "--no-acl", "--file", str(destination / "shared.dump")]
    for table in TABLES:
        args += ["--table", "public." + table]
    run(args, env)
    # A readable list also verifies that the dump archive is not truncated.
    listing = run(["pg_restore", "--list", str(destination / "shared.dump")], env)
    (destination / "archive-list.txt").write_text(listing)
    counts_sql = "select json_build_object(" + ",".join(
        "'" + t + "', (select count(*) from public." + t + ")" for t in TABLES) + ");"
    counts = json.loads(run(["psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-c", counts_sql], env))
    manifest = {"format": 1, "tables": TABLES, "observed_counts": counts,
                "checksums": {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                              for name in ("shared.dump", "functions.sql")}}
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2))
    for file in destination.iterdir():
        file.chmod(0o600)
    print("Pacote exportado e validado em " + str(destination))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="Diretório novo, privado, para o pacote")
    args = parser.parse_args()
    try:
        export(args.destination)
    except (RuntimeError, FileExistsError):
        print("Exportação interrompida. Confira utilitários, destino novo e conexão no ambiente; nenhum dado de origem foi modificado.", file=sys.stderr)
        sys.exit(1)
