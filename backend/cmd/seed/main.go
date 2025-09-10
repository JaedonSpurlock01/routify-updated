package main

import (
	"context"
	"fmt"
	"sync"

	"github.com/jaedonspurlock01/routify-updated/internal/handlers"
	"github.com/jaedonspurlock01/routify-updated/internal/models"
	"github.com/jaedonspurlock01/routify-updated/internal/services"
)

func main() {
	fmt.Println("🌱 Starting seed job...")

	cities, err := services.FetchTopCities(1000000) // population > 1m

	if err != nil {
		fmt.Println("Error fetching top cities:", err)
		return
	}

	fmt.Println("✅ Fetched cities:", len(cities))

	var wg sync.WaitGroup
	for _, c := range cities {
		wg.Add(1)
		go func(city models.City) {
			defer wg.Done()
			fmt.Printf("➡️  Processing %s (ID: %d, Type: %s)\n", city.Name, city.ID, city.Type)
			exists, _ := services.CheckOverpassInS3(context.TODO(), int64(city.ID))
			if !exists {
				handlers.ProcessCity(city.ID, city.Type)
			} else {
				fmt.Printf("✅ Overpass already exists for %s (ID: %d, Type: %s)\n", city.Name, city.ID, city.Type)
			}
		}(c)
	}

	wg.Wait()
	fmt.Println("🥂 Seed job completed.")
}
