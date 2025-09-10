package models

type Node struct {
	Type string  `json:"type"`
	ID   int64   `json:"id"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type Way struct {
	Type string  `json:"type"`
	IDs  []int64 `json:"ids"`
}

type ParsedOverpass struct {
	Nodes []Node `json:"nodes"`
	Ways  []Way  `json:"ways"`
}

type OverpassElement struct {
	Type  string  `json:"type"`
	ID    int64   `json:"id"`
	Lat   float64 `json:"lat,omitempty"`
	Lon   float64 `json:"lon,omitempty"`
	Nodes []int64 `json:"nodes,omitempty"`
}

type OverpassResponse struct {
	Elements []OverpassElement `json:"elements"`
}

type OverpassCityResponse struct {
	Elements []struct {
		Type       string            `json:"type"` // "node", "relation"
		ID         int               `json:"id"`
		Tags       map[string]string `json:"tags"`
		Population string            `json:"population,omitempty"`
	} `json:"elements"`
}

type City struct {
	ID         int
	Type       string
	Name       string
	Population string
}
