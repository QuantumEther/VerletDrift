# BMW E30 M3 visual model

The selector displays the silver top-down car image supplied by the project user as `body.png`. The image is used as provided, with its black background made transparent and its transparent margins trimmed for sprite use. Its artwork proportions are mapped to the visual model bounds; visual wheel anchors remain independently controlled by `vehicle-models.js`.

`wheel.svg` supplies the independently rendered, steerable wheels. The simulator's physical geometry and tire contact points remain separate and unchanged by selecting this appearance.
