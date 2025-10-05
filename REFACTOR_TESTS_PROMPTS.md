Prompt 1: Refactorización de Tests Unitarios

Analiza el siguiente archivo de test unitario y refactorízalo siguiendo estas mejores prácticas:

OBJETIVOS:

1. Dividir el archivo si supera las 300 líneas en archivos más pequeños y cohesivos
2. Eliminar duplicación de código mediante helpers y factories
3. Usar test.each() para casos similares con diferentes datos
4. Extraer funciones de assertion reutilizables
5. Organizar por responsabilidad funcional

ESTRUCTURA ESPERADA:

- Archivo principal: casos core y más importantes (150-250 líneas)
- Archivos específicos por funcionalidad (100-200 líneas c/u)
- Archivo de helpers/factories compartidos
- Mantener cobertura de tests existente

CRITERIOS DE DIVISIÓN:

- Agrupar por método/función siendo testeado
- Separar casos edge, errores, validaciones en archivos propios
- Un archivo por lógica de negocio compleja

FORMATO DE SALIDA:

1. Proponer estructura de archivos con nombres descriptivos
2. Crear archivo de helpers con mocks, factories y assertions
3. Refactorizar usando patterns DRY
4. Documentar qué va en cada archivo

NO cambiar la lógica de los tests, solo reorganizar y optimizar.

[PEGAR CÓDIGO DEL TEST AQUÍ]

Prompt 2: Refactorización de Tests E2E

Analiza el siguiente archivo de test E2E y refactorízalo siguiendo estas mejores prácticas:

OBJETIVOS:

1. Dividir si supera 400 líneas en archivos por operación HTTP/funcionalidad
2. Crear helper class específico para el recurso siendo testeado
3. Extraer factories para datos de prueba
4. Eliminar setup duplicado entre tests
5. Separar happy paths, validaciones, y casos edge

ESTRUCTURA ESPERADA:

- Dividir por operación: create, read, update, delete (150-250 líneas c/u)
- Helper class con métodos reutilizables para llamadas HTTP
- Factory con datos de prueba válidos e inválidos
- Archivo específico para casos complejos (jerarquías, relaciones, etc)

PATRONES A APLICAR:

- Helper class con métodos tipo: createResource(), updateResource(), etc
- Factories con patrones: basic(), withRelations(), invalid.\*
- Agrupar tests por: autenticación, validaciones, reglas de negocio, edge cases
- Usar test.each() para múltiples escenarios de validación

CRITERIOS DE DIVISIÓN:

- Un archivo por verbo HTTP principal (POST, GET, PUT/PATCH, DELETE)
- Archivo separado para operaciones especiales (búsquedas, filtros, relaciones)
- Tests de autorización pueden agruparse o estar en cada archivo

FORMATO DE SALIDA:

1. Estructura de carpetas propuesta
2. Helper class con todos los métodos necesarios
3. Archivo de factories
4. Archivos divididos con imports del helper
5. Mantener BeforeAll/AfterAll apropiadamente

NO cambiar assertions ni lógica de negocio, solo reorganizar.

[PEGAR CÓDIGO DEL TEST E2E AQUÍ]
