# Revisión de autenticación, registro y sesiones

## Controles comprobados

- Google: el backend verifica la firma RS256 con las claves públicas de Google, emisor, audiencia, expiración y correo verificado. La identidad se vincula por `sub` de Google; coincidir en correo no concede acceso a una cuenta existente.
- Roles: el cliente solo puede seleccionar estudiante o catedrático durante el primer registro. Las operaciones protegidas obtienen el rol y estado actuales desde MongoDB. No se acepta cambiar rol, aprobación o estado mediante el editor de perfil.
- JWT: algoritmo HS256 fijo, firma, emisor, audiencia y vencimiento obligatorios. La configuración sigue en `JWT_SECRET` y `JWT_EXPIRES_IN` del backend. El token no contiene teléfono, género, documento ni dirección.
- Cierre de sesión: `POST /api/auth/logout` invalida el JWT en MongoDB mediante SHA-256, hasta su expiración, y desconecta sus sockets. Cada sesión recibe un `jti` aleatorio; salir de una sesión no invalida otra. Se rechazan variantes no canónicas de la firma para impedir eludir la revocación.
- Navegador: las peticiones privadas envían `Authorization: Bearer`. Una respuesta 401 del token actual elimina la sesión y dirige a `/acceso?motivo=sesion`. También se programa el cierre según `exp`; esa lectura local no reemplaza la verificación del servidor. Un 401 tardío de otra sesión no cierra una sesión nueva.
- Registro extendido: teléfono, género, tipo y número de documento, categorías de interés, ciudad, dirección y coordenadas. Los catedráticos adjuntan un enlace HTTPS a su hoja de vida, PDF o portafolio, además de biografía y tarifa. El servidor comprueba los campos aunque se omita la validación del formulario.
- Privacidad: los datos personales se devuelven en el perfil del propio usuario, no en los perfiles públicos. La dirección textual, correo y enlaces de evidencia tampoco aparecen en la proyección pública de un tutor.
- Protección adicional: Helmet en la API, respuestas sin caché, límite de tamaño JSON y límite de intentos de acceso con Google. Los errores de la API no devuelven trazas ni credenciales.
- Suspensión: permite consultar el motivo, apelar y cerrar sesión; bloquea las demás operaciones privadas. La reactivación exige resolución administrativa.

La búsqueda, el catálogo, las categorías y los perfiles públicos siguen siendo consultas públicas. Las reservas, mensajes, edición de perfiles, denuncias y administración exigen JWT. Esto corresponde a la condición de la rúbrica «Toda petición protegida».

## Compatibilidad y límites

- No se modificaron ni rellenaron registros antiguos con datos inventados. El registro nuevo exige los campos completos y el formulario de edición los solicita también. La API mantiene compatibilidad con actualizaciones antiguas de cuentas que aún no tienen el bloque `personal`; una vez guardado ese bloque, no permite omitir la ubicación o evidencia obligatoria al editar.
- El tipo y número de documento son declarados por el usuario: no constituyen verificación oficial de identidad. La evidencia académica se proporciona mediante URL HTTPS y se revisa administrativamente; no se implementó un almacén de archivos PDF.
- El JWT permanece en `sessionStorage` para enviarlo como Bearer. Código malicioso ejecutado en el mismo origen podría acceder a él; se debe mantener la prevención de XSS. Una publicación futura necesita HTTPS y configurar la política de contenido en el alojamiento del frontend. Los encabezados de Helmet de la API no configuran el servidor Vite ni el alojamiento del frontend.
- Si el servidor no responde al salir, el navegador elimina la sesión local e informa del fallo de invalidación remota. Un token que no haya podido revocarse permanece sujeto a su vencimiento.
- El límite de intentos utiliza memoria del proceso, suficiente para la ejecución local con una instancia. Para varias instancias se necesita un almacén compartido.

## Pruebas reproducibles

Desde la raíz:

```powershell
npm.cmd run build
npm.cmd test
node backend/scripts/security-smoke.mjs
node backend/scripts/calendar-smoke.mjs
node backend/scripts/chat-smoke.mjs
node backend/scripts/moderation-smoke.mjs
npm.cmd audit --omit=dev
```

Los scripts de integración usan identidades ficticias y eliminan únicamente sus registros temporales. No imprimen secretos, JWT ni datos personales de cuentas reales. Las pruebas DOM usan respuestas HTTP simuladas; los scripts de integración comprueban la API, MongoDB y Socket.IO reales.

Referencias: [validación del token de Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [JWT de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet).
