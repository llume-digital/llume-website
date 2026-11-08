"""Utilidades de administración.

  python -m app.cli usuario <usuario> [--nombre "Nombre"]   # crea o cambia la contraseña (la pide por teclado)
  python -m app.cli importar datos/mi_config.json            # carga una configuración completa
  python -m app.cli copia /data/copias/lopita-2026-10-18.db  # copia de seguridad con la app en marcha
  python -m app.cli documento carta-comidas carta.pdf        # sube una carta en PDF a la web (como en la pestaña Web)
"""
import argparse
import getpass
import json
import sys

from lopita_horarios.models import Config

from .db import Store, default_db_path
from .web import DOCUMENTOS


def main(argv=None):
    ap = argparse.ArgumentParser(prog="app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    u = sub.add_parser("usuario")
    u.add_argument("usuario")
    u.add_argument("--nombre")
    i = sub.add_parser("importar")
    i.add_argument("fichero")
    b = sub.add_parser("copia")
    b.add_argument("destino")
    d = sub.add_parser("documento")
    d.add_argument("clave", choices=sorted(DOCUMENTOS))
    d.add_argument("fichero")
    args = ap.parse_args(argv)
    store = Store(default_db_path())
    if args.cmd == "usuario":
        pw = getpass.getpass("Contraseña (mín. 8 caracteres): ")
        if len(pw) < 8 or pw != getpass.getpass("Repite la contraseña: "):
            sys.exit("Contraseña demasiado corta o no coincide")
        store.upsert_user(args.usuario, pw, args.nombre)
        print(f"Usuario {args.usuario} guardado")
    elif args.cmd == "copia":
        store.copia(args.destino)
        print(f"Copia guardada en {args.destino}")
    elif args.cmd == "documento":
        with open(args.fichero, "rb") as f:
            datos = f.read()
        if not datos.startswith(b"%PDF-"):
            sys.exit("La carta tiene que ser un PDF")
        store.save_web_document(args.clave, args.fichero.rsplit("/", 1)[-1], "application/pdf", datos, "cli")
        print(f"{DOCUMENTOS[args.clave]} subida")
    else:
        with open(args.fichero, encoding="utf-8") as f:
            config = Config.model_validate(json.load(f))
        v = store.save_config(config, "cli", f"Importado de {args.fichero}")
        print(f"Configuración importada (versión {v})")


if __name__ == "__main__":
    main()
