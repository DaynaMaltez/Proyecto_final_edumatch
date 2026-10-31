# Revisión de errores — 30 de octubre de 2026

Correcciones realizadas:

- Las búsquedas ignoran respuestas antiguas y conservan los filtros aplicados al cambiar de página. Limpiar filtros cancela lógicamente los resultados anteriores.
- Un perfil público cerrado no vuelve a abrirse por una respuesta tardía.
- Cerrar sesión o cambiar de cuenta limpia los componentes privados y desconecta el chat. Un error de una sesión anterior no elimina el token de una sesión nueva.
- El botón «Quiero enseñar» abre el registro real.
- El formulario profesional omite fechas y descripciones opcionales vacías; exige coordenadas completas.
- La edición de perfiles detecta conflictos con la revisión administrativa para no sobrescribir aprobaciones.
- El chat conserva las confirmaciones de lectura ante respuestas tardías o mensajes repetidos.
- La conexión del chat en producción distingue una API relativa de un backend alojado en otro dominio.
- Las series incluyen la primera sesión, validan sus límites y respetan el margen de traslado de cada horario.
- Los horarios y cancelaciones reconocen reservas antiguas; cancelar una no modifica otra reserva de la misma cuenta.
- No se puede cambiar la modalidad de un curso con horarios futuros ni aprobar inscripciones de cursos eliminados.
- Las respuestas a JSON inválido y rutas inexistentes son JSON, sin trazas internas.
- El empaquetado separa React, mapas y chat para evitar la advertencia de tamaño del archivo principal.

Comandos de verificación:

```powershell
npm.cmd run build
npm.cmd test
node backend/scripts/calendar-smoke.mjs
node backend/scripts/chat-smoke.mjs
```

Los scripts de integración crean cuentas y datos temporales en la base configurada y eliminan únicamente sus propios registros al terminar.

No hubo navegador automatizable disponible en esta sesión. La comprobación visual completa y los servicios externos de Google y rutas requieren una prueba manual adicional; las pruebas no garantizan la ausencia de todo error posible.
