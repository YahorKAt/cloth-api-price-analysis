const BASE_API = "https://clothapi.progskill.ru";

// === Обработчик HTTP-ответов ===
async function handleResponse(response) {
    if (!response.ok) {
        const errorMessages = {
            401: "Пользователь неавторизован",
            403: "Доступ запрещён",
            404: "Ресурс не найден",
            422: "Неверные данные запроса",
            429: "Слишком много запросов. Повторите позже",
            500: "Внутренняя ошибка сервера",
            502: "Ошибка шлюза",
            503: "Сервис временно недоступен",
        };
        const message =
            errorMessages[response.status] || `HTTP-ошибка ${response.status}`;
        throw new Error(message);
    }

    try {
        return await response.json();
    } catch (e) {
        throw new Error("Некорректный JSON в ответе сервера");
    }
}

// === Получение всех категорий (с пагинацией) ===
async function getAllCategories() {
    const allCategories = [];
    let page = 1;
    let hasNext = true;

    while (hasNext) {
        const response = await fetch(
            `${BASE_API}/v1/categories?page=${page}&per_page=20`,
        );
        const data = await handleResponse(response);

        const items = Array.isArray(data.data) ? data.data : [];
        allCategories.push(...items);

        hasNext = data.has_next === true;
        page++;

        // Небольшая пауза для защиты от rate limiting
        if (hasNext) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return allCategories;
}

// === Получение нужного количества товаров ===
async function getNeededProducts(categoryId, neededCount, perPage = 20) {
    const products = [];
    let page = 1;
    let hasNext = true;

    while (products.length < neededCount && hasNext) {
        const response = await fetch(
            `${BASE_API}/v1/products?category_id=${categoryId}&min_stock=1&order_by=price_asc&page=${page}&per_page=${perPage}`,
        );
        const data = await handleResponse(response);

        const items = Array.isArray(data.data) ? data.data : [];
        products.push(...items);

        hasNext = data.has_next === true;
        page++;

        if (hasNext && products.length < neededCount) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    // Обрезаем до точного количества
    return products.slice(0, neededCount);
}

// === Основная функция анализа ===
async function getCategoryPriceAnalysis() {
    const priceMap = new Map();

    try {
        // 1. Получаем все категории
        const categories = await getAllCategories();

        if (categories.length === 0) {
            return priceMap; // Пустая Map, если нет категорий
        }

        // 2. Обрабатываем каждую категорию
        for (const category of categories) {
            const categoryId = category.id;
            const categoryName = category.name;

            // 3. Первый запрос для получения total_count
            const firstPageResponse = await fetch(
                `${BASE_API}/v1/products?category_id=${categoryId}&min_stock=1&order_by=price_asc`,
            );
            const firstPageData = await handleResponse(firstPageResponse);

            const totalCount = firstPageData.total_count || 0;

            // Пропускаем категории без товаров
            if (totalCount === 0) {
                continue;
            }

            // 4. Считаем количество товаров (не менее 10%, округление вверх)
            const neededCount = Math.ceil(totalCount * 0.1);

            // 5. Загружаем только нужное количество товаров
            const products = await getNeededProducts(categoryId, neededCount);

            // 6. Проверяем, что товары действительно загрузились
            if (products.length === 0) {
                continue;
            }

            // 7. Считаем среднюю цену (округление по математическим правилам)
            const sum = products.reduce(
                (acc, product) => acc + product.price,
                0,
            );
            const avgPrice = Math.round(sum / products.length);

            // 8. Добавляем в результат
            priceMap.set(categoryName, avgPrice);
        }

        return priceMap;
    } catch (error) {
        // Пробрасываем ошибку дальше (Promise будет rejected)
        throw new Error(`Ошибка анализа: ${error.message}`);
    }
}

getCategoryPriceAnalysis()
    .then(priceMap => {
        if (priceMap.size === 0) {
            console.log("Нет данных для анализа.");
        } else {
            console.log("\nРезультаты анализа (10-й перцентиль):");
            for (const [categoryName, avgPrice] of priceMap) {
                console.log(
                    `Категория: ${categoryName}, Средняя цена (10% дешёвых): ${avgPrice}`,
                );
            }
        }
    })
    .catch(error => console.error("Ошибка анализа:", error));
