const ingredientCatalog = {
  1: ["Chickpeas", "Flour", "Yogurt", "Onion", "Tomato", "Green Chili", "Spice Mix", "Coriander"],
  2: ["Potato", "Butter", "Tomato", "Capsicum", "Peas", "Onion", "Pav Bread", "Spice Mix"],
  3: ["Potato", "Peas", "Cornflour", "Onion", "Coriander", "Green Chili", "Breadcrumbs", "Spice Mix"],
  4: ["Flour", "Potato", "Peas", "Cumin", "Green Chili", "Coriander", "Oil", "Spice Mix"],
  5: ["Semolina Shells", "Potato", "Chickpeas", "Mint Water", "Tamarind", "Cumin", "Black Salt", "Onion"],
  6: ["Potato", "Cornflour", "Garlic", "Soy Sauce", "Spring Onion", "Sesame", "Green Chili", "Capsicum"],
  7: ["Flour Sheets", "Cabbage", "Carrot", "Spring Onion", "Soy Sauce", "Pepper", "Oil", "Garlic"],
  8: ["Noodles", "Cabbage", "Carrot", "Capsicum", "Soy Sauce", "Garlic", "Spring Onion", "Pepper"],
  9: ["Noodles", "Cabbage", "Carrot", "Beans", "Soy Sauce", "Garlic", "Pepper", "Spring Onion"],
  10: ["Rice", "Carrot", "Beans", "Capsicum", "Soy Sauce", "Garlic", "Spring Onion", "Pepper"],
  11: ["Cucumber", "Tomato", "Onion", "Carrot", "Lemon", "Black Pepper", "Salt", "Coriander"],
  12: ["Bread", "Paneer", "Chipotle Sauce", "Onion", "Capsicum", "Cheese", "Butter", "Lettuce"],
  13: ["Burger Bun", "Veg Patty", "Mayonnaise", "Lettuce", "Tomato", "Onion", "Cheese", "Pickles"],
  14: ["Bread", "Paneer", "Cheese", "Butter", "Onion", "Capsicum", "Mint Chutney", "Tomato"],
  15: ["Pizza Base", "Cheese", "Tomato Sauce", "Oregano", "Olive Oil", "Capsicum", "Onion", "Chili Flakes"],
  16: ["Lentils", "Rice", "Curry Leaves", "Mustard Seeds", "Dry Red Chili", "Onion", "Coriander", "Oil"],
  17: ["Rice", "Urad Dal", "Fenugreek", "Lentils", "Mustard Seeds", "Curry Leaves", "Ghee", "Coriander"],
  18: ["Rice Batter", "Potato", "Onion", "Mustard Seeds", "Curry Leaves", "Ghee", "Green Chili", "Coriander"],
  19: ["Rice Batter", "Paneer", "Onion", "Cheese", "Capsicum", "Mustard Seeds", "Curry Leaves", "Ghee"],
  20: ["Paneer", "Rice", "Soy Sauce", "Garlic", "Capsicum", "Spring Onion", "Green Chili", "Cornflour"],
  21: ["Veg Manchurian", "Rice", "Cabbage", "Carrot", "Soy Sauce", "Garlic", "Spring Onion", "Cornflour"],
  22: ["Black Lentils", "Cream", "Butter", "Tomato", "Rice", "Ginger", "Garlic", "Spice Mix"],
  23: ["Black Lentils", "Cream", "Butter", "Tomato", "Ginger", "Garlic", "Coriander", "Spice Mix"],
  24: ["Paneer", "Cream", "Butter", "Tomato", "Cashew", "Onion", "Ginger", "Spice Mix"],
  25: ["Paneer", "Butter", "Tomato", "Cream", "Cashew", "Onion", "Ginger", "Spice Mix"],
  26: ["Rice", "Cumin", "Ghee", "Coriander", "Bay Leaf", "Clove", "Salt", "Green Chili"]
}

const rawFoods = [
  {
    id: 1,
    name: "Chole Bhature",
    price: 145,
    category: "Street Food",
    image: "https://thewhiskaddict.com/wp-content/uploads/2024/08/IMG_0727-4-scaled.jpg"
  },
  {
    id: 2,
    name: "Pao Bhaji",
    price: 140,
    category: "Street Food",
    image: "https://www.cookshideout.com/wp-content/uploads/2015/05/Instant-Pot-Pav-Bhaji_FI.jpg"
  },
  {
    id: 3,
    name: "Aloo Tikki",
    price: 80,
    category: "Street Food",
    image: "https://sinfullyspicy.com/wp-content/uploads/2023/03/1-1.jpg"
  },
  {
    id: 4,
    name: "Samosa",
    price: 38,
    category: "Street Food",
    image: "https://images.unsplash.com/photo-1601050690597-df0568f70950"
  },
  {
    id: 5,
    name: "Gol Gappa",
    price: 57,
    category: "Street Food",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRdiLt17KVILUi_aVY9OBI2m2JJhKsaqe2kZg&s"
  },
  {
    id: 6,
    name: "Crispy Chilli Potato",
    price: 170,
    category: "China Express",
    image: "https://instamart-media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,h_960,w_960//InstamartAssets/1/honey_chilli_potato.webp"
  },
  {
    id: 7,
    name: "Veg Spring Roll",
    price: 170,
    category: "China Express",
    image: "https://cdn.shopify.com/s/files/1/0554/9450/8618/files/veg-spring-rolls-1.webp?v=1748478127"
  },
  {
    id: 8,
    name: "Veg Chowmein",
    price: 180,
    category: "China Express",
    image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841"
  },
  {
    id: 9,
    name: "Hakka Noodles",
    price: 200,
    category: "China Express",
    image: "https://tiffinandteaofficial.com/wp-content/uploads/2020/11/IMG_7663-1-scaled-e1605519663454.jpg"
  },
  {
    id: 10,
    name: "Veg Fried Rice",
    price: 200,
    category: "China Express",
    image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b"
  },
  {
    id: 11,
    name: "Green Salad",
    price: 130,
    category: "Salad",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd"
  },
  {
    id: 12,
    name: "Chipotle Paneer Sandwich",
    price: 95,
    category: "Continental",
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af"
  },
  {
    id: 13,
    name: "Veg Burger",
    price: 120,
    category: "Continental",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349"
  },
  {
    id: 14,
    name: "Paneer Grilled Sandwich",
    price: 150,
    category: "Continental",
    image: "https://static.toiimg.com/photo/60043279.cms"
  },
  {
    id: 15,
    name: "Cheese Pizza",
    price: 200,
    category: "Continental",
    image: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3"
  },
  {
    id: 16,
    name: "Vada Sambhar",
    price: 130,
    category: "South Indian",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmHnRRl6eFPkcyqTY-CktrHNJ14c-e9ZHEfQ&s"
  },
  {
    id: 17,
    name: "Idli Sambhar",
    price: 130,
    category: "South Indian",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSd_q_aLnvh4fo0wMaDx712JYym79oXimH60w&s"
  },
  {
    id: 18,
    name: "Masala Dosa",
    price: 180,
    category: "South Indian",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRYH7H-KRy-dnN9To-d5TJu7dKpY3f_nr0w3Q&s"
  },
  {
    id: 19,
    name: "Paneer Dosa",
    price: 200,
    category: "South Indian",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIWUJW5ZkQBVO1KiBXtNl1xW0hZQXGMzXJCw&s"
  },
  {
    id: 20,
    name: "Chilli Paneer with Fried Rice",
    price: 220,
    category: "Rice Bowl",
    image: "https://cdn.uengage.io/uploads/48101/image-3433-1762684763.jpg"
  },
  {
    id: 21,
    name: "Veg Manchurian with Fried Rice",
    price: 210,
    category: "Rice Bowl",
    image: "https://image.cdn.shpy.in/392528/SKU-0829_0-1757578043008.jpg?width=600&format=webp"
  },
  {
    id: 22,
    name: "Dal Makhani with Rice",
    price: 220,
    category: "Rice Bowl",
    image: "https://www.jewelofasia.com.au/cdn/shop/files/Dal-Makhani-with-Basmati-Rice_8d9176ff-a736-417e-907a-ee114b489522.jpg?v=1753410313"
  },
  {
    id: 23,
    name: "Dal Makhani",
    price: 300,
    category: "A La Carte",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQoydDZqYAOKVPs2vv1TDwg78fs89IbL7aFzA&s"
  },
  {
    id: 24,
    name: "Shahi Paneer",
    price: 310,
    category: "A La Carte",
    image: "https://indianshealthyrecipes.com/wp-content/uploads/2024/07/ShahiPaneer-3.jpg"
  },
  {
    id: 25,
    name: "Paneer Butter Masala",
    price: 310,
    category: "A La Carte",
    image: "https://vegecravings.com/wp-content/uploads/2017/04/paneer-butter-masala-recipe-step-by-step-instructions.jpg"
  },
  {
    id: 26,
    name: "Jeera Rice",
    price: 195,
    category: "A La Carte",
    image: "https://www.indianhealthyrecipes.com/wp-content/uploads/2022/12/jeera-rice-recipe.jpg"
  }
]

export const foods = rawFoods.map((food) => ({
  ...food,
  ingredients: ingredientCatalog[food.id] || []
}))
