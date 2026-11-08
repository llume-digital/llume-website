# Dependencias copiadas para los tests

- `axe-4.10.2.min.js`: [axe-core](https://github.com/dequelabs/axe-core) 4.10.2 de Deque Systems, con licencia
  MPL-2.0 (la cabecera del archivo lo indica). Lo usa `tests/test_accesibilidad_navegador.py` para revisar las
  pantallas sin depender de una CDN. Para actualizarlo: `npm pack axe-core@<versión>` y copiar `axe.min.js`.
