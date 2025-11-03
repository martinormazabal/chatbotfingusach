# Gestión de usuarios y seguridad

Este documento resume los controles implementados y las oportunidades de mejora detectadas tras la revisión de los flujos de administración de cuentas. Las recomendaciones toman como referencia las 10 heurísticas de usabilidad de Nielsen y principios de seguridad por defecto.

## Controles implementados

- **Alta de usuarios robusta**
  - Generación automática de contraseñas temporales cuando el solicitante no aporta una propia.
  - Validación de fortaleza de la contraseña (longitud mínima de 10 caracteres, mezcla de mayúsculas, minúsculas, dígitos y símbolos).
  - Normalización y validación estricta de roles permitidos.
  - Notificación por correo (o logging seguro cuando el correo no está configurado) que guía al usuario a cambiar su contraseña en el primer acceso.
- **Gestión de contraseñas**
  - Endpoints dedicados para cambio controlado, solicitud de restablecimiento y confirmación mediante token temporal.
  - Tokens cifrados y con expiración para evitar uso indebido.
  - Invalidación inmediata de tokens al consumirlos.
  - Registro de todas las acciones críticas en consola para auditoría rápida durante el desarrollo.
- **Resiliencia operacional**
  - Creación perezosa de tablas auxiliares para evitar fallos cuando aún no se han aplicado los scripts de inicialización.
  - Degradación segura del envío de correo (Heurística "Visibilidad del estado del sistema"): si la infraestructura SMTP no está configurada se informa al log sin interrumpir al usuario final.

## Hallazgos y mejoras recomendadas

1. **Retroalimentación inmediata (Heurística 1)**
   - Exponer mensajes consistentes al usuario final en frontend cuando las acciones de contraseña fallan o requieren confirmación adicional.
   - Incorporar indicadores visuales de progreso y confirmación para cada flujo.
2. **Prevención de errores (Heurística 5)**
   - Añadir límites a los intentos de restablecimiento y cambio de contraseña para reducir ataques de fuerza bruta.
   - Registrar eventos críticos en un sistema de observabilidad centralizado.
3. **Reconocimiento mejor que recuerdo (Heurística 6)**
   - Proporcionar asistentes o plantillas para la asignación de roles y permisos.
   - Mostrar el historial reciente de accesos o cambios de contraseña para que el usuario valide sus acciones.
4. **Flexibilidad y eficiencia de uso (Heurística 7)**
   - Permitir que administradores disparen invitaciones masivas y personalizadas conservando el control de expiración de tokens.
   - Automatizar recordatorios periódicos para renovar credenciales antiguas.
5. **Ayuda y documentación (Heurística 10)**
   - Mantener visible en el frontend una guía de gestión de credenciales con preguntas frecuentes.
   - Documentar flujos de soporte ante cuentas comprometidas o perdidas.

## Próximos pasos sugeridos

- Integrar autenticación multifactor (MFA) para roles críticos.
- Implementar bitácoras firmadas digitalmente para cambios de rol.
- Automatizar pruebas de regresión sobre los nuevos endpoints de contraseña.
- Alinear el frontend con estos endpoints asegurando una experiencia accesible y coherente.