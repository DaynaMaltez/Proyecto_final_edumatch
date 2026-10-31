# Marketplace educativo

Monorepo inicial para el marketplace que conecta estudiantes y tutores.

## Requisitos

- Node.js 20 o posterior y npm.
- MongoDB local o una instancia accesible para las siguientes etapas.

## Desarrollo

1. Instalar dependencias desde la raíz: `npm install`.
2. Copiar `backend/.env.example` a `backend/.env` y ajustar la configuración local cuando se conecte la base de datos.
3. Ejecutar frontend y backend: `npm run dev`.

Frontend: http://localhost:5173  
API: http://localhost:4000/api/health

También se pueden iniciar por separado con `npm run dev:frontend` y `npm run dev:backend`.

## Estructura

- `frontend/`: React, TypeScript, Vite y estilos SASS/SCSS.
- `backend/`: API Express con TypeScript, configuración y módulos por dominio.
- `docs/`: espacio para manuales y diagramas.

La ruta `/api/health` solo verifica que la API esté activa; los módulos del marketplace aún no están implementados.
