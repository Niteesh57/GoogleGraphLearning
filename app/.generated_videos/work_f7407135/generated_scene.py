from manim import *

class GenScene(Scene):
    def construct(self):
        self.camera.background_color = '#0E1117'

        # Helper function to create a neural network layer
        def create_layer(num_nodes, color):
            nodes = VGroup(*[Circle(radius=0.3, color=color, fill_opacity=0.8) for _ in range(num_nodes)])
            nodes.arrange(DOWN, buff=0.5)
            return nodes

        # Helper function to connect layers
        def connect_layers(layer1, layer2):
            lines = VGroup()
            for n1 in layer1:
                for n2 in layer2:
                    lines.add(Line(n1.get_right(), n2.get_left(), stroke_width=2, stroke_opacity=0.5))
            return lines

        # STEP 1: Introduction to the Neural Network Structure
        title = Text("A Simple Neural Network", font_size=40).to_edge(UP)
        input_layer = create_layer(2, BLUE).shift(LEFT * 4)
        hidden_layer = create_layer(3, GREEN)
        output_layer = create_layer(1, RED).shift(RIGHT * 4)

        connections1 = connect_layers(input_layer, hidden_layer)
        connections2 = connect_layers(hidden_layer, output_layer)

        input_label = Text("Input", font_size=24).next_to(input_layer, DOWN)
        hidden_label = Text("Hidden", font_size=24).next_to(hidden_layer, DOWN)
        output_label = Text("Output", font_size=24).next_to(output_layer, DOWN)

        network = VGroup(input_layer, hidden_layer, output_layer, connections1, connections2, input_label, hidden_label, output_label)

        self.play(Write(title))
        self.play(Create(network), run_time=3)
        self.wait(5)
        self.play(FadeOut(title), FadeOut(network), run_time=1)
        self.wait(1)

        # STEP 2: The Forward Pass
        title_step2 = Text("Step 1: The Forward Pass", font_size=40).to_edge(UP)
        self.play(Write(title_step2))
        self.play(FadeIn(network), run_time=1)

        prediction_text = Text("Prediction = 0.7", font_size=32).next_to(output_layer, RIGHT, buff=0.5)
        
        # Animate data flow
        path_arrows = VGroup()
        for line in connections1:
            path_arrows.add(Arrow(line.get_start(), line.get_end(), buff=0.1, stroke_width=4, color=YELLOW))
        for line in connections2:
            path_arrows.add(Arrow(line.get_start(), line.get_end(), buff=0.1, stroke_width=4, color=YELLOW))

        self.play(ShowPassingFlash(path_arrows.copy().set_color(YELLOW), time_width=0.5), run_time=3)
        self.play(Write(prediction_text))
        self.wait(5)

        # STEP 3: Calculating the Error
        title_step3 = Text("Step 2: Calculate The Error", font_size=40).to_edge(UP)
        self.play(Transform(title_step2, title_step3))
        
        target_text = Text("Target = 1.0", font_size=32).next_to(prediction_text, UP, buff=0.5)
        error_box = SurroundingRectangle(VGroup(prediction_text, target_text), buff=0.2)
        error_label_long = Text("Error = (Target - Prediction)^2", font_size=28)
        error_label_long.next_to(error_box, RIGHT, buff=0.5)

        self.play(Write(target_text))
        self.play(Create(error_box))
        self.play(Write(error_label_long))
        self.wait(5)
        
        error_group = VGroup(prediction_text, target_text, error_box, error_label_long)
        self.play(FadeOut(title_step2), FadeOut(error_group), run_time=1)
        self.wait(1)

        # STEP 4: The Core Idea of Backpropagation
        title_step4 = Text("Step 3: Backpropagation", font_size=40).to_edge(UP)
        self.play(Write(title_step4))

        error_text_simple = Text("Error Signal", font_size=32, color=ORANGE).next_to(output_layer, RIGHT, buff=0.5)
        explanation = Text("Send error signal backwards\nto find who is responsible.", font_size=28).to_edge(DOWN)

        self.play(Write(error_text_simple))
        self.wait(2)
        
        backward_arrows = VGroup()
        for line in connections2:
            backward_arrows.add(Arrow(line.get_end(), line.get_start(), buff=0.1, stroke_width=4, color=ORANGE))
        for line in connections1:
             backward_arrows.add(Arrow(line.get_end(), line.get_start(), buff=0.1, stroke_width=4, color=ORANGE))
        
        self.play(Write(explanation))
        self.play(Create(backward_arrows), run_time=3)
        self.wait(5)
        self.play(FadeOut(title_step4), FadeOut(error_text_simple), FadeOut(explanation), FadeOut(backward_arrows), run_time=1)
        self.wait(1)

        # STEP 5: Updating Weights
        title_step5 = Text("Step 4: Update Weights to Reduce Error", font_size=40).to_edge(UP)
        self.play(Write(title_step5))
        self.wait(1)
        
        update_explanation = Text("Adjust connections (weights)\nto make a better prediction next time.", font_size=28).to_edge(DOWN)
        
        self.play(Write(update_explanation))
        self.play(connections2.animate.set_color(YELLOW).set_stroke(width=6), run_time=2)
        self.play(connections2.animate.set_color(WHITE).set_stroke(width=2), run_time=2)
        self.play(connections1.animate.set_color(YELLOW).set_stroke(width=6), run_time=2)
        self.play(connections1.animate.set_color(WHITE).set_stroke(width=2), run_time=2)
        self.wait(5)

        self.play(FadeOut(title_step5), FadeOut(update_explanation), FadeOut(network))
        self.wait(1)

        # STEP 6: The Learning Cycle
        title_step6 = Text("The Learning Cycle", font_size=40).to_edge(UP)
        self.play(Write(title_step6))
        
        step1_text = Text("1. Forward Pass", font_size=32).shift(UP * 2)
        step2_text = Text("2. Calculate Error", font_size=32).shift(RIGHT * 3)
        step3_text = Text("3. Backpropagation", font_size=32).shift(DOWN * 2)
        step4_text = Text("4. Update Weights", font_size=32).shift(LEFT * 3)
        
        arrow1 = CurvedArrow(step1_text.get_right(), step2_text.get_top(), angle=-PI/2)
        arrow2 = CurvedArrow(step2_text.get_bottom(), step3_text.get_right(), angle=-PI/2)
        arrow3 = CurvedArrow(step3_text.get_left(), step4_text.get_bottom(), angle=-PI/2)
        arrow4 = CurvedArrow(step4_text.get_top(), step1_text.get_left(), angle=-PI/2)

        cycle = VGroup(step1_text, step2_text, step3_text, step4_text, arrow1, arrow2, arrow3, arrow4)
        
        self.play(Write(step1_text))
        self.play(Create(arrow1), Write(step2_text))
        self.play(Create(arrow2), Write(step3_text))
        self.play(Create(arrow3), Write(step4_text))
        self.play(Create(arrow4))
        self.wait(5)

        final_text = Text("This cycle repeats, making the\nnetwork smarter over time.", font_size=32)
        self.play(FadeOut(cycle), FadeOut(title_step6), run_time=1)
        self.play(Write(final_text))
        self.wait(5)
        self.play(FadeOut(final_text))
        self.wait(1)