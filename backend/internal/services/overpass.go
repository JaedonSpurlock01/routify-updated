package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/jaedonspurlock01/routify-updated/internal/models"
)

func SendOverpassRequest(osm_id int, osm_type string) (models.OverpassResponse, error) {
	var areaID int64

	if osm_type == "relation" {
		areaID = int64(osm_id + 36e8)
	} else if osm_type == "way" {
		areaID = int64(osm_id + 24e8)
	}

	// Different types of filtering out lines
	var roadStrict string = "[highway~'^(((motorway|trunk|primary|secondary|tertiary)(_link)?)|unclassified|residential|living_street|pedestrian|service|track)$'][area!=yes]"

	// Softer filters, probably shouldn't use
	// var roadBasic string = "[highway~'^(motorway|primary|secondary|tertiary)|residential']"
	// var road = "[highway]"
	// var building = "[building]"
	// var allWays = ""

	var timeout int = 900
	var maxHeapSize int = 1073741824
	var responseType string = "skel"

	query := fmt.Sprintf(`[timeout:%d][maxsize:%d][out:json];area(%d);(._;)->.area;(way%s(area.area); node(w););out %s;`,
		timeout,
		maxHeapSize,
		areaID,
		roadStrict,
		responseType,
	)

	/** Different overpass URL options

	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass-api.de/api/interpreter",
	"https://overpass.openstreetmap.ru/cgi/interpreter",
	*/

	resp, err := http.Post(
		"https://overpass-api.de/api/interpreter",
		"application/x-www-form-urlencoded",
		bytes.NewBufferString("data="+query),
	)

	if err != nil {
		return models.OverpassResponse{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return models.OverpassResponse{}, err
	}

	var overpassResponse models.OverpassResponse
	if err := json.Unmarshal(body, &overpassResponse); err != nil {
		return models.OverpassResponse{}, err
	}

	return overpassResponse, nil
}

// parseOverpassResponse takes an OverpassResponse and converts it into a ParsedOverpass, which is a data structure more
// suitable for use in the routing algorithms. It groups the elements of the OverpassResponse into nodes and ways, and
// returns a ParsedOverpass containing the nodes and ways.
// Returns a json formatted list of nodes and objects
/* Example
{
  nodes: [
    {type,id, lat, lon}, {type, id, lat, lon}, {type, id, lat, lon}, ...
  ],
  ways: [
    {type, ways: [id, id2, id3]}, {type, ways: [id, id2, id3]}
  ]
}
*/
func ParseOverpassResponse(resp models.OverpassResponse) models.ParsedOverpass {
	var nodes []models.Node
	var ways []models.Way

	for _, element := range resp.Elements {
		if element.Type == "node" {
			nodes = append(nodes, models.Node{
				Type: element.Type,
				ID:   element.ID,
				Lat:  element.Lat,
				Lon:  element.Lon,
			})
		} else if element.Type == "way" {
			ways = append(ways, models.Way{
				Type: element.Type,
				IDs:  element.Nodes,
			})
		}
	}

	return models.ParsedOverpass{
		Nodes: nodes,
		Ways:  ways,
	}
}

func FetchTopCities(population_min int) ([]models.City, error) {
	var timeout int = 900
	var maxHeapSize int = 1073741824

	var query string = fmt.Sprintf(`
		[out:json][timeout:%d][maxsize:%d];
		(
			node["place"="city"](if:t["population"] > %d);
			relation["place"="city"](if:t["population"] > %d);
		);
		out ids tags;
	`, timeout, maxHeapSize, population_min, population_min)

	/** Different overpass URL options

	"https://overpass.kumi.systems/api/interpreter",
	"https://overpass-api.de/api/interpreter",
	"https://overpass.openstreetmap.ru/cgi/interpreter",
	*/

	resp, err := http.Post(
		"https://overpass-api.de/api/interpreter",
		"application/x-www-form-urlencoded",
		bytes.NewBufferString("data="+query),
	)

	if err != nil {
		return []models.City{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("overpass returned %d: %s", resp.StatusCode, string(body))
	}

	var data models.OverpassCityResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to parse overpass response: %w", err)
	}

	var results []models.City
	for _, el := range data.Elements {
		name := el.Tags["name"]
		if name == "" {
			continue
		}
		results = append(results, models.City{
			ID:         el.ID,
			Type:       el.Type, // "node", "relation"
			Name:       name,
			Population: el.Tags["population"],
		})
	}

	return results, nil
}
