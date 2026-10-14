"""Publica esta web en GitHub Pages desde cualquier ordenador (Mac o Windows).

  python3 publicar.py "qué he cambiado"      (en Windows: py publicar.py "…")

1. Comprueba que no se cuela ninguna clave secreta.
2. Si hay cambios, los guarda y marca una versión nueva (version.json): a quien tenga la app
   abierta le sale «Hay una versión nueva · RECARGAR».
3. Trae lo que haya subido el otro (Jose Luis / Héctor) y, si chocáis, se para sin perder nada.
4. Lo sube. GitHub lo publica en 1-2 minutos.
"""
from __future__ import annotations

import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], cwd=AQUI, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args)} falló:\n{r.stderr or r.stdout}")
    return r.stdout


def main() -> int:
    mensaje = " ".join(sys.argv[1:]).strip() or f"Cambios {datetime.now():%Y-%m-%d %H:%M}"
    for f in AQUI.rglob("*"):
        if ".git" in f.parts or not f.is_file() or f.suffix not in (".js", ".html", ".css", ".json", ".md", ".py"):
            continue
        if re.search(r"sb_secret_[A-Za-z0-9_]{10,}", f.read_text(encoding="utf-8", errors="ignore")):
            print(f"¡ALTO! {f.name} contiene una clave SECRETA. No se publica nada.")
            return 3
    git("add", "-A")
    cambios = [l for l in git("status", "--porcelain").splitlines() if not l.endswith("version.json")]
    if cambios:
        (AQUI / "version.json").write_text(f'{{"version": "{datetime.now():%Y%m%d-%H%M%S}"}}\n', encoding="utf-8")
        git("add", "version.json")
        git("commit", "-m", mensaje)
        print(f"{len(cambios)} fichero(s) cambiado(s).")
    else:
        print("No hay cambios nuevos.")
    r = subprocess.run(["git", "pull", "--rebase", "origin", "main"], cwd=AQUI, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        subprocess.run(["git", "rebase", "--abort"], cwd=AQUI, capture_output=True)
        print("ALTO: el otro ha cambiado lo mismo que tú. No se ha subido ni perdido nada.")
        print("Mira qué ficheros chocan con «git status» y vuelve a publicar.\n" + (r.stdout + r.stderr)[-600:])
        return 4
    git("push", "origin", "main")
    print("Publicado. En 1-2 minutos está en la web y a quien la tenga abierta le sale «RECARGAR».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
